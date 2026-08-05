import { forEachCompany, withTenantContext } from '@/lib/db';

/**
 * Seguimiento de los expedientes abiertos.
 *
 * Cuando se cumple el plazo configurado entre acciones, el expediente
 * queda listo para escalar — pero nadie se va a acordar. Este trabajo
 * crea una tarea para que aparezca en el panel y en la campana, con el
 * enlace al expediente.
 *
 * Es idempotente por expediente: si la tarea de seguimiento ya existe y
 * sigue pendiente, no crea otra. Repetir el aviso todos los días
 * convertiría la bandeja en ruido y dejaría de leerse.
 */

const AVISO_PREVIO_DIAS = 2;

export type FollowUpSummary = {
  condominiums: number;
  due: number;
  created: number;
  skipped: number;
};

export async function createFollowUpTasks(now: Date = new Date()): Promise<FollowUpSummary> {
  const limite = new Date(now.getTime() + AVISO_PREVIO_DIAS * 86_400_000);
  const resumen: FollowUpSummary = { condominiums: 0, due: 0, created: 0, skipped: 0 };

  const porEmpresa = await forEachCompany(async (tx, companyId) => {
    const casos = await tx.violationCase.findMany({
      where: {
        status: 'abierto',
        nextActionDueAt: { not: null, lte: limite },
      },
      include: {
        violationType: { select: { name: true, warningsRequired: true, immediateFine: true } },
        property: { select: { code: true } },
        condominium: { select: { id: true, name: true } },
      },
    });
    return { companyId, casos };
  });

  for (const { result } of porEmpresa) {
    const { companyId, casos } = result;
    resumen.due += casos.length;

    for (const c of casos) {
      const titulo = `Incumplimiento ${c.caseNumber} — ${c.property.code}: corresponde la siguiente acción`;

      await withTenantContext(companyId, async (tx) => {
        // ¿Ya hay una tarea viva para este expediente?
        const existente = await tx.adminTask.findFirst({
          where: { companyId, title: titulo, status: { not: 'completada' } },
          select: { id: true },
        });
        if (existente) {
          resumen.skipped += 1;
          return;
        }

        const siguiente = c.fineIssued
          ? 'la multa'
          : c.warningsIssued >= c.violationType.warningsRequired
            ? 'la multa'
            : `la ${c.warningsIssued + 1}.ª advertencia`;

        await tx.adminTask.create({
          data: {
            companyId,
            condominiumId: c.condominium.id,
            title: titulo,
            category: 'Administrativo',
            priority: 'alta',
            dueDate: c.nextActionDueAt,
            notes:
              `Expediente ${c.caseNumber} por ${c.violationType.name} en la filial ${c.property.code}. ` +
              `Ya se emitieron ${c.warningsIssued} advertencia(s); según la configuración corresponde ${siguiente}. ` +
              `Abrí Gestión de Incumplimientos y reportá el mismo tipo para esa filial: el sistema emite lo que toca.`,
          },
        });
        resumen.created += 1;
      });
    }

    if (casos.length > 0) resumen.condominiums += 1;
  }

  return resumen;
}

// ============================================================
// Indicadores del panel
// ============================================================

export type ViolationDashboard = {
  mes: number;
  abiertos: number;
  porVencer: number;
  multas: number;
  multasMonto: number;
  sinLeer: number;
  promedioResolucionDias: number | null;
  topFiliales: { code: string; total: number }[];
  topTipos: { name: string; total: number }[];
};

export async function getViolationDashboard(
  companyId: string,
  condominiumId: string,
  now: Date = new Date()
): Promise<ViolationDashboard> {
  const inicioMes = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const en7dias = new Date(now.getTime() + 7 * 86_400_000);

  return withTenantContext(companyId, async (tx) => {
    const [mes, abiertos, porVencer, casos, sinLeer] = await Promise.all([
      tx.violationCase.count({ where: { condominiumId, openedAt: { gte: inicioMes } } }),
      tx.violationCase.count({ where: { condominiumId, status: 'abierto' } }),
      tx.violationCase.count({
        where: { condominiumId, status: 'abierto', nextActionDueAt: { not: null, lte: en7dias } },
      }),
      tx.violationCase.findMany({
        where: { condominiumId },
        select: {
          openedAt: true,
          closedAt: true,
          fineIssued: true,
          property: { select: { code: true } },
          violationType: { select: { name: true } },
          actions: { where: { kind: 'multa' }, select: { fineAmount: true } },
        },
      }),
      tx.violationAction.count({ where: { case: { condominiumId }, readAt: null } }),
    ]);

    const multas = casos.filter((c) => c.fineIssued).length;
    const multasMonto = casos
      .flatMap((c) => c.actions)
      .reduce((n, a) => n + Number(a.fineAmount ?? 0), 0);

    const cerrados = casos.filter((c) => c.closedAt);
    const promedioResolucionDias = cerrados.length
      ? Math.round(
          cerrados.reduce((n, c) => n + (c.closedAt!.getTime() - c.openedAt.getTime()) / 86_400_000, 0) /
            cerrados.length
        )
      : null;

    const contar = <T extends string>(valores: T[]) => {
      const m = new Map<T, number>();
      for (const v of valores) m.set(v, (m.get(v) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    };

    return {
      mes,
      abiertos,
      porVencer,
      multas,
      multasMonto,
      sinLeer,
      promedioResolucionDias,
      topFiliales: contar(casos.map((c) => c.property.code)).map(([code, total]) => ({ code, total })),
      topTipos: contar(casos.map((c) => c.violationType.name)).map(([name, total]) => ({ name, total })),
    };
  });
}

// ============================================================
// Reportes
// ============================================================

export type ViolationReportFilters = {
  condominiumId: string;
  desde?: Date;
  hasta?: Date;
  typeId?: string;
  propertyId?: string;
  status?: string;
  soloConMulta?: boolean;
  soloReincidencias?: boolean;
};

export type ViolationReportRow = {
  caseNumber: string;
  propertyCode: string;
  ownerName: string;
  typeName: string;
  status: string;
  warnings: number;
  fine: boolean;
  fineAmount: number;
  openedAt: Date;
  lastActionAt: Date | null;
  closedAt: Date | null;
  issuedBy: string;
  readCount: number;
  actionCount: number;
};

export async function getViolationReport(
  companyId: string,
  f: ViolationReportFilters
): Promise<ViolationReportRow[]> {
  return withTenantContext(companyId, async (tx) => {
    const casos = await tx.violationCase.findMany({
      where: {
        condominiumId: f.condominiumId,
        ...(f.typeId ? { violationTypeId: f.typeId } : {}),
        ...(f.propertyId ? { propertyId: f.propertyId } : {}),
        ...(f.status ? { status: f.status as any } : {}),
        ...(f.soloConMulta ? { fineIssued: true } : {}),
        ...(f.soloReincidencias ? { warningsIssued: { gte: 2 } } : {}),
        ...(f.desde || f.hasta
          ? { openedAt: { ...(f.desde ? { gte: f.desde } : {}), ...(f.hasta ? { lte: f.hasta } : {}) } }
          : {}),
      },
      include: {
        property: { select: { code: true } },
        person: { select: { fullName: true } },
        violationType: { select: { name: true } },
        actions: { select: { readAt: true, fineAmount: true, issuedByName: true }, orderBy: { issuedAt: 'desc' } },
      },
      orderBy: { openedAt: 'desc' },
    });

    return casos.map((c) => ({
      caseNumber: c.caseNumber,
      propertyCode: c.property.code,
      ownerName: c.person?.fullName ?? '—',
      typeName: c.violationType.name,
      status: c.status,
      warnings: c.warningsIssued,
      fine: c.fineIssued,
      fineAmount: c.actions.reduce((n, a) => n + Number(a.fineAmount ?? 0), 0),
      openedAt: c.openedAt,
      lastActionAt: c.lastActionAt,
      closedAt: c.closedAt,
      issuedBy: c.actions[0]?.issuedByName ?? c.createdByName ?? '—',
      readCount: c.actions.filter((a) => a.readAt).length,
      actionCount: c.actions.length,
    }));
  });
}
