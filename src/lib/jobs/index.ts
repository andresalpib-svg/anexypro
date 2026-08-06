import { forEachCompany, withTenantContext } from '@/lib/db';
import { registerJob, listJobs, runJob, runAllJobs } from '@/lib/jobs/runner';
import { applyLateInterestEverywhere } from '@/lib/services/late-interest';
import { generateOrdinaryBilling } from '@/lib/services/finance';
import { generateRecurringExpenses, refreshContractStatuses } from '@/lib/services/recurring';
import { runCollectionLadder } from '@/lib/services/collections';
import { generateMonthlyReports } from '@/lib/services/monthly-report';
import { createFollowUpTasks } from '@/lib/services/violation-followup';
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
  run: async (now) => {
    const r = await applyLateInterestEverywhere(now);
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
  run: async (now) => {
    const day = now.getDate();
    // El programador corre sin sesión: recorre empresa por empresa, con
    // el contexto de cada una, en vez de consultar por encima de todas.
    const porEmpresa = await forEachCompany((tx) =>
      tx.condominium.findMany({
        where: {
          deletedAt: null,
          financialSettings: { autoBilling: true, autoBillingDay: day },
        },
        select: { id: true, companyId: true, name: true },
      })
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
  run: async (now) => {
    const r = await generateRecurringExpenses(now);
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
  run: async (now) => {
    const r = await refreshContractStatuses(now);
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
  run: async (now) => {
    const r = await runCollectionLadder(now);
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
  run: async (now) => {
    // Solo corre el día 1; el resto de los días no hace nada.
    if (now.getDate() !== 1) {
      return { summary: 'El informe mensual se genera el día 1 de cada mes.' };
    }
    const r = await generateMonthlyReports(now);
    return {
      summary:
        `${r.generated} informe(s) generado(s) de ${r.condominiums} condominio(s)` +
        (r.errors.length ? ` · ${r.errors.length} con error: ${r.errors.join('; ')}` : ''),
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
  run: async (now) => {
    const r = await createFollowUpTasks(now);
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
