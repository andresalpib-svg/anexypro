import { prisma, forEachCompany, withTenantContext } from '@/lib/db';
import { registerJob, listJobs, runJob, runAllJobs } from '@/lib/jobs/runner';
import { applyLateInterestEverywhere } from '@/lib/services/late-interest';
import { generateOrdinaryBilling } from '@/lib/services/finance';
import { generateRecurringExpenses, refreshContractStatuses } from '@/lib/services/recurring';
import { runCollectionLadder } from '@/lib/services/collections';
import { generateMonthlyReports } from '@/lib/services/monthly-report';
import { createFollowUpTasks } from '@/lib/services/violation-followup';
import { runMonthlyDepreciationJob } from '@/lib/services/asset-depreciation';
import { periodOf } from '@/lib/services/accounting-periods';
import { JOB_REVISION } from '@/lib/services/system-health';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Interés moratorio — diario.
 *
 * La clave de corrida es el día, así que si el programador dispara
 * varias veces solo la primera hace trabajo. Y por el diseño
 * acumulativo del cálculo, saltarse un día no deja un hueco: al día
 * siguiente cobra la diferencia completa.
 */
registerJob({
  name: 'interes-moratorio',
  description: 'Calcula el interés de los cargos vencidos en los condominios que lo tengan activado',
  runKey: (now) => `interes:${isoDay(now)}`,
  run: async (now, opts) => {
    const r = await applyLateInterestEverywhere(now, opts);
    return {
      summary:
        r.condominiums === 0
          ? 'Ningún condominio tiene activado el cobro de intereses.'
          : `${r.condominiums} condominio(s) · ${r.chargesEvaluated} cargos vencidos · ` +
            `${r.interestsCreated} interés nuevo(s), ${r.interestsUpdated} actualizado(s) · total ₡${r.totalAmount.toLocaleString('es-CR')}`,
      details: r as unknown as Record<string, unknown>,
    };
  },
});

/**
 * Facturación automática de la cuota ordinaria — diaria, pero solo
 * actúa en los condominios cuyo `autoBillingDay` sea hoy.
 *
 * Esto existía en el modelo de datos desde el inicio y NUNCA se
 * ejecutaba: la emisión dependía de que alguien entrara a apretar un
 * botón cada mes.
 */
registerJob({
  name: 'facturacion-automatica',
  description: 'Emite la cuota ordinaria del mes en los condominios cuyo día de facturación sea hoy',
  runKey: (now) => `facturacion:${isoDay(now)}`,
  run: async (now, opts) => {
    const day = now.getDate();
    // El programador corre sin sesión: recorre empresa por empresa, con
    // el contexto de cada una, en vez de consultar por encima de todas.
    // `opts.companyId` acota a una sola empresa cuando quien dispara es
    // un `admin_owner` de sesión, no el programador ni master.
    const porEmpresa = await forEachCompany(
      (tx) =>
        tx.condominium.findMany({
          where: {
            deletedAt: null,
            financialSettings: { autoBilling: true, autoBillingDay: day },
          },
          select: { id: true, companyId: true, name: true },
        }),
      { includeDemo: false, companyId: opts?.companyId }
    );
    const condos = porEmpresa.flatMap((x) => x.result);

    if (condos.length === 0) {
      return { summary: `Ningún condominio factura el día ${day}.` };
    }

    const period = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    let emitted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const condo of condos) {
      try {
        const r = await generateOrdinaryBilling(condo.companyId, condo.id, period);
        if (!r.created) {
          skipped += 1;
          continue;
        }
        emitted += 1;
        await withTenantContext(condo.companyId, (tx) =>
          tx.billingRunLog.create({
            data: {
              condominiumId: condo.id,
              runDate: now,
              batchId: r.batch.id,
              status: 'ok',
              detail: `Emisión automática · ${r.chargesCreated} cargos`,
            },
          })
        );
      } catch (e: any) {
        errors.push(`${condo.name}: ${e?.message ?? 'error'}`);
        await withTenantContext(condo.companyId, (tx) =>
          tx.billingRunLog.create({
            data: {
              condominiumId: condo.id,
              runDate: now,
              status: 'error',
              detail: (e?.message ?? 'error').slice(0, 300),
            },
          })
        ).catch(() => undefined);
      }
    }

    const parts = [`${emitted} condominio(s) facturado(s)`];
    if (skipped) parts.push(`${skipped} ya tenían el lote del mes`);
    if (errors.length) parts.push(`${errors.length} con error: ${errors.join('; ')}`);
    return { summary: parts.join(' · ') };
  },
});

/**
 * Gastos recurrentes — diario.
 *
 * Crea en BORRADOR los gastos que entran en su ventana de antelación.
 * Nunca los aprueba: el monto de un servicio varía mes a mes.
 */
registerJob({
  name: 'gastos-recurrentes',
  description: 'Crea en borrador los gastos recurrentes próximos a vencer',
  runKey: (now) => `recurrentes:${isoDay(now)}`,
  run: async (now, opts) => {
    const r = await generateRecurringExpenses(now, opts);
    return {
      summary:
        r.evaluated === 0
          ? 'No hay gastos recurrentes configurados.'
          : `${r.evaluated} recurrente(s) evaluado(s) · ${r.created} borrador(es) creado(s) · ${r.skipped} sin novedad`,
      details: r as unknown as Record<string, unknown>,
    };
  },
});

/** Contratos — diario: marca los que entran en ventana de aviso o vencieron. */
registerJob({
  name: 'contratos',
  description: 'Actualiza el estado de los contratos y marca los próximos a vencer',
  runKey: (now) => `contratos:${isoDay(now)}`,
  run: async (now, opts) => {
    const r = await refreshContractStatuses(now, opts);
    return {
      summary:
        r.evaluated === 0
          ? 'No hay contratos registrados.'
          : `${r.evaluated} contrato(s) · ${r.porVencer} por vencer · ${r.vencidos} vencido(s)`,
      details: r as unknown as Record<string, unknown>,
    };
  },
});

/**
 * Escalamiento de cobranza — diario.
 *
 * Registra la acción que corresponde a cada moroso según sus días de
 * mora, una sola vez por escalón. Las filiales con convenio vigente se
 * saltan por completo.
 */
registerJob({
  name: 'cobranza',
  description: 'Registra la gestión de cobro que corresponde a cada filial morosa',
  runKey: (now) => `cobranza:${isoDay(now)}`,
  run: async (now, opts) => {
    const r = await runCollectionLadder(now, opts);
    return {
      summary:
        r.evaluated === 0
          ? 'Ninguna filial en mora.'
          : `${r.evaluated} filial(es) en mora · ${r.actions} gestión(es) registrada(s)` +
            (r.skippedWithPlan ? ` · ${r.skippedWithPlan} con convenio vigente (excluidas)` : ''),
      details: r as unknown as Record<string, unknown>,
    };
  },
});

/**
 * Informe financiero mensual — el día 1 de cada mes.
 *
 * Deja el informe como comunicado en BORRADOR dirigido a la junta
 * directiva. Nunca lo envía solo: generar el texto es trabajo del
 * sistema, decidir si se envía es del administrador.
 */
registerJob({
  name: 'informe-mensual',
  description: 'Genera el informe financiero del mes anterior para cada condominio',
  runKey: (now) => `informe:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  run: async (now, opts) => {
    // Solo corre el día 1; el resto de los días no hace nada.
    if (now.getDate() !== 1) {
      return { summary: 'El informe mensual se genera el día 1 de cada mes.' };
    }
    const r = await generateMonthlyReports(now, opts);
    return {
      summary:
        `${r.generated} informe(s) generado(s) de ${r.condominiums} condominio(s)` +
        (r.errors.length ? ` · ${r.errors.length} con error: ${r.errors.join('; ')}` : ''),
      details: r as unknown as Record<string, unknown>,
    };
  },
});

/**
 * Depreciación de activos — el día 1 de cada mes (mismo patrón que
 * "informe-mensual": el job se registra todos los días, pero solo
 * actúa el día 1; la clave de corrida es el período "YYYY-MM", así
 * que aunque se dispare varias veces ese día, solo la primera trabaja).
 *
 * Salta en silencio (no es error) los activos sin datos completos, ya
 * de baja, o que ya se depreciaron este período — ver
 * `runAssetDepreciationForCondo`. El botón "Depreciar este período" de
 * /app/activos usa el mismo servicio para ponerse al día a mano.
 */
registerJob({
  name: 'depreciacion-activos',
  description: 'Registra la depreciación mensual de los activos con datos completos',
  runKey: (now) => `depreciacion:${periodOf(now)}`,
  run: async (now, opts) => {
    if (now.getDate() !== 1) {
      return { summary: 'La depreciación se corre el día 1 de cada mes.' };
    }
    const r = await runMonthlyDepreciationJob(now, opts);
    return {
      summary:
        r.evaluated === 0
          ? 'Ningún activo registrado.'
          : `${r.condominiums} condominio(s) · ${r.evaluated} activo(s) evaluado(s) · ${r.created} depreciación(es) registrada(s) · ${r.skipped} sin novedad`,
      details: r as unknown as Record<string, unknown>,
    };
  },
});

/**
 * Seguimiento de incumplimientos — diario.
 *
 * Crea la tarea para el administrador cuando un expediente abierto está
 * por cumplir el plazo de su siguiente acción. Sin esto, el
 * escalamiento depende de que alguien se acuerde.
 */
registerJob({
  name: 'seguimiento-incumplimientos',
  description: 'Avisa de los expedientes de incumplimiento que ya pueden escalar a la siguiente acción',
  runKey: (now) => `incumplimientos:${isoDay(now)}`,
  run: async (now, opts) => {
    const r = await createFollowUpTasks(now, opts);
    return {
      summary:
        r.due === 0
          ? 'Ningún expediente próximo a escalar.'
          : `${r.due} expediente(s) por escalar · ${r.created} tarea(s) creada(s) · ${r.skipped} ya tenían aviso`,
      details: r as unknown as Record<string, unknown>,
    };
  },
});

/**
 * Empresas demo vencidas — diario.
 *
 * BLOQUEA (nunca borra) las empresas creadas desde /demo cuyo
 * `demoExpiresAt` ya pasó — el mismo campo `blockedAt`/`blockReason`
 * que usa cualquier empresa en mora real, así que no hace falta
 * pantalla nueva: el admin_owner demo ve el aviso de suspensión de
 * siempre. `companies` no lleva Row-Level Security (el login la
 * necesita antes de saber de qué empresa es nadie), así que se
 * consulta directo.
 *
 * Corre una vez al día dentro del mismo cron: una empresa demo puede
 * quedar vencida-pero-sin-bloquear hasta la corrida siguiente (máximo
 * ~24 h), que es el trade-off que se aceptó por no sumar un segundo
 * cron de Vercel.
 */
registerJob({
  name: 'demo-vencidos',
  description: 'Bloquea las empresas demo cuyo acceso ya venció',
  // Recorre TODAS las empresas demo de la plataforma sin distinción —
  // no hay forma de acotarlo a "mi empresa", así que un admin_owner de
  // sesión no puede dispararlo en absoluto (ver runner.ts / route.ts).
  scope: 'plataforma',
  runKey: (now) => `demo-vencidos:${isoDay(now)}`,
  run: async (now) => {
    const vencidas = await prisma.company.findMany({
      where: {
        isDemo: true,
        blockedAt: null,
        demoExpiresAt: { lt: now },
        // Defensivo: una demo ya convertida no debería auto-bloquearse
        // por vencimiento. En la práctica `convertDemoToFormal`
        // (PASO 6, services/demo.ts) ya pone `isDemo:false` — así que
        // esta fila deja de aparecer en el `where` de arriba de todos
        // modos — pero este chequeo por `demoStatus` queda como
        // segunda red, sin costo, por si algún día algo toca
        // `demoStatus` sin tocar `isDemo`.
        //
        // OJO: `demoStatus: { not: 'DEMO_CONVERTIDO' }` a secas EXCLUYE
        // también las filas con `demoStatus: null` (comprobado en vivo:
        // Prisma lo traduce a `<> 'DEMO_CONVERTIDO'`, y en SQL esa
        // comparación contra NULL da UNKNOWN, no verdadero) — habría
        // dejado de vencer TODAS las demos creadas antes de que este
        // campo existiera. El OR explícito cubre null Y "distinto de".
        OR: [{ demoStatus: null }, { demoStatus: { not: 'DEMO_CONVERTIDO' } }],
      },
      select: { id: true, legalName: true },
    });
    if (vencidas.length === 0) {
      return { summary: 'Ninguna empresa demo venció desde la última corrida.' };
    }
    await prisma.company.updateMany({
      where: { id: { in: vencidas.map((c) => c.id) } },
      data: { blockedAt: now, blockReason: 'Demo expirada. Solicitá una nueva en /demo.', demoStatus: 'DEMO_VENCIDO' },
    });
    await prisma.demoHistoryEntry.createMany({
      data: vencidas.map((c) => ({ companyId: c.id, event: 'vencida', occurredAt: now })),
    });
    // Auditoría: mismo mecanismo (`audit_log`, módulo "Suscripción")
    // que usa `blockCompany` cuando el MASTER bloquea una empresa a
    // mano (`services/subscriptions.ts`) — acá el "actor" es el
    // programador, no una persona, así que `userId` queda en null y el
    // nombre lo dice explícito. `audit_log` lleva RLS: un `create` por
    // empresa, cada uno con su contexto — no hay forma de hacerlo en un
    // solo `createMany` sin salirse del aislamiento.
    for (const c of vencidas) {
      await withTenantContext(c.id, (tx) =>
        tx.auditLog.create({
          data: {
            companyId: c.id,
            userId: null,
            userName: 'Sistema (job demo-vencidos)',
            module: 'Suscripción',
            action: 'Acceso bloqueado por vencimiento de demo',
            target: `Venció ${now.toISOString()}`,
          },
        })
      ).catch(() => undefined);
    }
    return { summary: `${vencidas.length} empresa(s) demo bloqueada(s) por vencimiento.` };
  },
});

/**
 * Revisión del sistema — diaria.
 *
 * POR QUÉ ES UN JOB Y NO SOLO UNA PANTALLA. `/master/estado` comprueba
 * en vivo, pero solo cuando alguien la abre. Una credencial que caduca
 * un martes no le avisa a nadie: sigue todo aparentemente normal hasta
 * que un residente se queda sin su correo de bienvenida. Eso pasó de
 * verdad con la clave de Resend.
 *
 * Este proceso hace la misma comprobación todos los días y **anota el
 * resultado**. Si algo falla, el job TERMINA EN ERROR a propósito: así
 * la avería queda registrada en la bitácora con su detalle, el panel la
 * levanta de ahí sin volver a salir a la red, y —como el programador
 * reintenta lo que no terminó bien— la próxima corrida vuelve a
 * comprobar en vez de dar por buena una foto vieja.
 *
 * Los avisos y lo que está sin configurar NO tumban la corrida: se
 * anotan en el resumen. Solo las fallas reales cuentan como error.
 */
registerJob({
  name: JOB_REVISION,
  description: 'Comprueba que las credenciales y los servicios externos sigan respondiendo',
  // Verifica servicios compartidos de toda la plataforma (correo,
  // IA, etc.), no algo por empresa — reservado a master/CRON_SECRET.
  scope: 'plataforma',
  runKey: (now) => `salud:${isoDay(now)}`,
  run: async () => {
    const { comprobarSistema, comoTexto } = await import('@/lib/services/system-health');
    const { comprobaciones } = await comprobarSistema();
    const fallas = comprobaciones.filter((c) => c.estado === 'error');

    if (fallas.length > 0) {
      // El mensaje del error ES la bitácora: se guarda tal cual en
      // JobRun.error y es lo que el panel muestra.
      throw new Error(
        `${fallas.length} servicio(s) con falla: ${fallas.map((c) => c.titulo).join(', ')}.\n\n` +
          comoTexto(comprobaciones)
      );
    }

    const avisos = comprobaciones.filter((c) => c.estado === 'aviso' || c.estado === 'apagado');
    return {
      summary:
        avisos.length === 0
          ? `Los ${comprobaciones.length} servicios responden con normalidad.`
          : `Sin fallas. ${avisos.length} con aviso o sin configurar: ${avisos.map((c) => c.titulo).join(', ')}.`,
      details: { comprobaciones } as unknown as Record<string, unknown>,
    };
  },
});

export { listJobs, runJob, runAllJobs };
