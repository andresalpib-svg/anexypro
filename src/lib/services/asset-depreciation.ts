import type { Prisma } from '@prisma/client';
import { withTenantContext, forEachCompany } from '@/lib/db';
import { periodOf } from '@/lib/services/accounting-periods';
import { logActivity } from '@/lib/services/audit';
import { round2 } from '@/lib/domain/late-interest';
import { calculateDepreciation, nextPeriodAmount, type AssetDepreciationInput } from '@/lib/domain/asset-depreciation';

/**
 * Depreciación de activos (Etapa 6).
 *
 * Un renglón por activo por período ("YYYY-MM") en
 * `AssetDepreciationEntry` — el `@@unique([assetId, period])` es la
 * barrera real contra la depreciación duplicada; este servicio solo la
 * anticipa con un mensaje claro antes de chocar contra ella.
 */

const DEPRECIATION_EXPENSE_ACCOUNT = '5902'; // Gasto por Depreciación
const ACCUMULATED_DEPRECIATION_ACCOUNT = '1502'; // Depreciación Acumulada (contra-activo)

/** Los 5 campos que hacen falta para poder depreciar un activo. `null` si falta alguno. */
function depreciationInputOf(asset: {
  acquisitionValue: Prisma.Decimal | null;
  residualValue: Prisma.Decimal | null;
  usefulLifeMonths: number | null;
  depreciationMethod: string | null;
  depreciationStartDate: Date | null;
}): AssetDepreciationInput | null {
  if (
    asset.acquisitionValue === null ||
    asset.usefulLifeMonths === null ||
    !asset.depreciationMethod ||
    asset.depreciationStartDate === null
  ) {
    return null;
  }
  return {
    acquisitionValue: Number(asset.acquisitionValue),
    residualValue: Number(asset.residualValue ?? 0),
    usefulLifeMonths: asset.usefulLifeMonths,
    depreciationStartDate: asset.depreciationStartDate,
  };
}

export async function getAssetDepreciation(companyId: string, assetId: string) {
  return withTenantContext(companyId, async (tx) => {
    const asset = await tx.asset.findUnique({
      where: { id: assetId },
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, legalName: true, tradeName: true } },
        disposal: true,
      },
    });
    if (!asset) return null;

    const entries = await tx.assetDepreciationEntry.findMany({
      where: { assetId },
      orderBy: { period: 'desc' },
    });

    const input = depreciationInputOf(asset);
    // `snapshot` es la proyección TEÓRICA (cuánto correspondería según
    // la fórmula, a hoy) — útil para mostrar "cuánto tocaría este
    // período". `accumulatedSoFar`/`realBookValue` son lo REALMENTE
    // registrado en `entries`, la cifra que manda para reportar.
    const snapshot = input ? calculateDepreciation(input, new Date()) : null;
    const accumulatedSoFar = round2(entries.reduce((s, e) => s + Number(e.amount), 0));
    const realBookValue = input
      ? round2(Math.max(input.residualValue, input.acquisitionValue - accumulatedSoFar))
      : asset.acquisitionValue !== null
        ? round2(Number(asset.acquisitionValue))
        : null;

    return { asset, entries, snapshot, accumulatedSoFar, realBookValue };
  });
}

/**
 * Acumulado real (desde `AssetDepreciationEntry`) de TODOS los activos
 * de un condominio, en una sola consulta — evita N+1 en la lista.
 */
export async function listAssetBookValues(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, async (tx) => {
    const sums = await tx.assetDepreciationEntry.groupBy({
      by: ['assetId'],
      where: { condominiumId },
      _sum: { amount: true },
    });
    return new Map(sums.map((s) => [s.assetId, Number(s._sum.amount ?? 0)]));
  });
}

/**
 * Todos los renglones de depreciación del condominio, aplanados — es
 * el reporte de "Depreciaciones" (Etapa 7). Lee la misma tabla que
 * llena `runAssetDepreciation`, sin recalcular nada: el total de esta
 * lista es, por construcción, el mismo que ya se contabilizó en la
 * cuenta 5902 (Gasto por Depreciación).
 */
export async function listDepreciationEntries(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.assetDepreciationEntry.findMany({
      where: { condominiumId },
      orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
      include: { asset: { select: { code: true, name: true } } },
    })
  );
}

/**
 * Registra la depreciación de UN activo para UN período. Es el único
 * punto que crea un `AssetDepreciationEntry` — tanto el botón manual
 * como el job mensual pasan por acá.
 */
export async function runAssetDepreciation(
  companyId: string,
  user: { id: string; name: string },
  input: { assetId: string; period?: string }
) {
  return withTenantContext(companyId, async (tx) => {
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: input.assetId } });
    if (asset.status === 'baja') {
      throw new Error('Este activo está de baja — no se puede seguir depreciando.');
    }

    const depInput = depreciationInputOf(asset);
    if (!depInput) {
      throw new Error(
        'Al activo le falta algún dato de depreciación (valor de adquisición, vida útil, método o fecha de inicio).'
      );
    }

    const period = input.period ?? periodOf(new Date());

    // Barrera contra depreciación duplicada — se anticipa al índice
    // único con un mensaje legible.
    const already = await tx.assetDepreciationEntry.findUnique({
      where: { assetId_period: { assetId: input.assetId, period } },
      select: { id: true },
    });
    if (already) {
      throw new Error(`Este activo ya tiene depreciación registrada para ${period}.`);
    }

    const priorEntries = await tx.assetDepreciationEntry.findMany({
      where: { assetId: input.assetId },
      select: { amount: true },
    });
    const alreadyAccumulated = round2(priorEntries.reduce((s, e) => s + Number(e.amount), 0));

    const amount = nextPeriodAmount(depInput, alreadyAccumulated);
    if (amount <= 0) {
      throw new Error('Este activo ya está completamente depreciado — no queda base depreciable pendiente.');
    }

    const accumulatedAfter = round2(alreadyAccumulated + amount);
    const bookValueAfter = round2(Math.max(depInput.residualValue, depInput.acquisitionValue - accumulatedAfter));

    // Asiento: Débito Gasto por Depreciación / Crédito Depreciación
    // Acumulada — respeta período contable cerrado automáticamente.
    const { createJournalEntryPublic } = await import('@/lib/services/accounting');
    await createJournalEntryPublic(tx, companyId, {
      condominiumId: asset.condominiumId,
      date: new Date(`${period}-01T12:00:00`),
      description: `Depreciación ${period} — ${asset.code} · ${asset.name}`,
      source: 'depreciacion',
      sourceTable: 'asset_depreciation_entries',
      sourceId: asset.id,
      lines: [
        { accountCode: DEPRECIATION_EXPENSE_ACCOUNT, debit: amount },
        { accountCode: ACCUMULATED_DEPRECIATION_ACCOUNT, credit: amount },
      ],
    });

    const entry = await tx.assetDepreciationEntry.create({
      data: {
        companyId,
        condominiumId: asset.condominiumId,
        assetId: asset.id,
        period,
        amount,
        accumulatedAfter,
        bookValueAfter,
        createdById: user.id,
      },
    });

    await logActivity(tx, companyId, {
      userId: user.id,
      userName: user.name,
      module: 'Mantenimientos de Áreas Comunes',
      action: 'Depreciación registrada',
      target: `${asset.code} · ${asset.name} · ${period} · ₡${amount.toLocaleString('es-CR')}`,
    });

    return entry;
  });
}

export type DepreciationRunSummary = {
  evaluated: number;
  created: number;
  skipped: number;
};

/**
 * Corre `runAssetDepreciation` para cada activo depreciable y activo
 * del condominio — la usa tanto el botón "Depreciar todos" de la
 * pantalla como el job mensual. Salta en silencio (no es un error) los
 * activos que no aplican: sin datos completos, ya de baja, o ya
 * depreciados este período.
 */
export async function runAssetDepreciationForCondo(
  companyId: string,
  condominiumId: string,
  period: string,
  user: { id: string; name: string } = { id: 'sistema', name: 'Programador' }
): Promise<DepreciationRunSummary> {
  const assets = await withTenantContext(companyId, (tx) =>
    tx.asset.findMany({ where: { condominiumId, status: { not: 'baja' } }, select: { id: true } })
  );

  const summary: DepreciationRunSummary = { evaluated: assets.length, created: 0, skipped: 0 };
  for (const a of assets) {
    try {
      await runAssetDepreciation(companyId, user, { assetId: a.id, period });
      summary.created += 1;
    } catch {
      // Sin datos, ya depreciado este período, o ya en el tope — no es
      // un fallo del job, es un activo que hoy no aplica.
      summary.skipped += 1;
    }
  }
  return summary;
}

export type MonthlyDepreciationSummary = {
  condominiums: number;
  evaluated: number;
  created: number;
  skipped: number;
};

/** Corrida mensual — mismo patrón que `generateRecurringExpenses`/`runCollectionLadder`. */
export async function runMonthlyDepreciationJob(
  now: Date,
  opts?: { companyId?: string }
): Promise<MonthlyDepreciationSummary> {
  const period = periodOf(now);
  const condos = (
    await forEachCompany(
      (tx) => tx.condominium.findMany({ where: { deletedAt: null }, select: { id: true, companyId: true } }),
      { includeDemo: false, companyId: opts?.companyId }
    )
  ).flatMap((x) => x.result);

  const summary: MonthlyDepreciationSummary = { condominiums: condos.length, evaluated: 0, created: 0, skipped: 0 };
  for (const condo of condos) {
    const r = await runAssetDepreciationForCondo(condo.companyId, condo.id, period);
    summary.evaluated += r.evaluated;
    summary.created += r.created;
    summary.skipped += r.skipped;
  }
  return summary;
}

/**
 * Baja de un activo — nunca borra la fila (Etapa 6). Calcula el valor
 * en libros a la fecha de baja con la misma fórmula de depreciación
 * (o el valor de adquisición completo si el activo nunca tuvo datos de
 * depreciación) y deja `Asset.status = 'baja'`.
 */
export async function disposeAsset(
  companyId: string,
  user: { id: string; name: string },
  input: { assetId: string; date: Date; reason: string; documentUrl?: string; documentName?: string }
) {
  if (!input.reason || input.reason.trim().length < 5) {
    throw new Error('Indicá el motivo de la baja.');
  }
  return withTenantContext(companyId, async (tx) => {
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: input.assetId } });
    if (asset.status === 'baja') throw new Error('Este activo ya está de baja.');

    const existingDisposal = await tx.assetDisposal.findUnique({ where: { assetId: input.assetId } });
    if (existingDisposal) throw new Error('Este activo ya tiene una baja registrada.');

    const depInput = depreciationInputOf(asset);
    let bookValue = Number(asset.acquisitionValue ?? 0);
    if (depInput) {
      bookValue = calculateDepreciation(depInput, input.date).bookValue;
    }

    const disposal = await tx.assetDisposal.create({
      data: {
        companyId,
        condominiumId: asset.condominiumId,
        assetId: asset.id,
        date: input.date,
        reason: input.reason.trim(),
        bookValueAtDisposal: round2(bookValue),
        documentUrl: input.documentUrl || null,
        documentName: input.documentName || null,
        createdById: user.id,
      },
    });

    await tx.asset.update({ where: { id: asset.id }, data: { status: 'baja' } });

    await logActivity(tx, companyId, {
      userId: user.id,
      userName: user.name,
      module: 'Mantenimientos de Áreas Comunes',
      action: 'Activo dado de baja',
      target: `${asset.code} · ${asset.name} · ${input.reason.trim()}`,
    });

    return disposal;
  });
}
