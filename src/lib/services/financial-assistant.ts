import Anthropic from '@anthropic-ai/sdk';
import { withTenantContext } from '@/lib/db';
import { round2 } from '@/lib/domain/late-interest';
import { classify, type Intent } from '@/lib/domain/assistant-intents';
import { getCollectionsView } from '@/lib/services/collections';
import { getBudget } from '@/lib/services/budget';
import { getCashFlow } from '@/lib/services/cash-flow';
import { listBankAccountsWithBalance } from '@/lib/services/bank-accounts';
import { CATEGORY_LABEL } from '@/lib/services/expenses';

/**
 * Asistente financiero.
 *
 * DECISIÓN DE ARQUITECTURA CENTRAL: la IA no calcula, solo redacta.
 *
 * Todas las cifras se obtienen con las mismas consultas que alimentan
 * los estados financieros y el panel. El modelo de lenguaje recibe
 * números YA CALCULADOS y su único trabajo es explicarlos en prosa.
 * Así es imposible que invente un monto — y si el modelo no está
 * disponible, la respuesta se arma igual con un redactor determinista.
 *
 * Toda respuesta muestra la tabla de la que salió, para que el
 * administrador pueda verificar en vez de confiar.
 */

export type AnswerTable = {
  title: string;
  columns: string[];
  rows: (string | number)[][];
};

export type SuggestedAction = { label: string; href: string };

export type AssistantAnswer = {
  intent: Intent;
  /** Titular en una línea: el dato principal. */
  headline: string;
  /** Análisis en prosa. Lo redacta la IA si está disponible. */
  narrative: string;
  table: AnswerTable | null;
  recommendations: string[];
  actions: SuggestedAction[];
  /** Si la prosa la escribió el modelo o el redactor propio. */
  writtenBy: 'ia' | 'sistema';
};

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n);

const pct = (n: number) => `${Math.round(n)}%`;

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const SYSTEM_PROMPT = `Eres un analista financiero que asesora a administradores de condominios en Costa Rica.

Recibes datos YA CALCULADOS. Reglas absolutas:
- NUNCA inventes, cambies ni recalcules una cifra. Usa exactamente las que te dan.
- NUNCA agregues números que no estén en los datos.
- Escribe en español de Costa Rica, tono directo y profesional, sin relleno ni saludos.
- Máximo 4 oraciones.
- Distinguí siempre lo puntual de lo estructural: si un aumento viene de un gasto único, decilo.
- No repitas la tabla; el usuario ya la ve. Explicá qué significa.`;

/** Redacta con el modelo; si no hay llave, devuelve null y se usa el propio. */
async function polish(context: string): Promise<string | null> {
  const anthropic = getClient();
  if (!anthropic) return null;
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: context }],
    });
    return message.content.find((b) => b.type === 'text')?.text ?? null;
  } catch {
    // Si el modelo falla, el asistente sigue funcionando con su propia
    // redacción: nunca se queda sin responder.
    return null;
  }
}

// ============================================================
// Recolección de datos por intención — todo en SQL
// ============================================================

async function analyzeExpenses(companyId: string, condominiumId: string) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));

  return withTenantContext(companyId, async (tx) => {
    const expenses = await tx.expense.findMany({
      where: {
        condominiumId,
        status: { in: ['aprobado', 'pagado'] },
        issueDate: { gte: sixMonthsAgo },
      },
      select: {
        category: true,
        total: true,
        issueDate: true,
        description: true,
        supplier: { select: { legalName: true, tradeName: true } },
      },
    });

    const thisMonth = expenses.filter((e) => e.issueDate >= monthStart);
    const previous = expenses.filter((e) => e.issueDate < monthStart);
    const monthsOfHistory = Math.max(1, new Set(previous.map((e) => e.issueDate.toISOString().slice(0, 7))).size);

    const byCategory = new Map<string, { now: number; avg: number }>();
    for (const e of thisMonth) {
      const c = byCategory.get(e.category) ?? { now: 0, avg: 0 };
      c.now += Number(e.total);
      byCategory.set(e.category, c);
    }
    for (const e of previous) {
      const c = byCategory.get(e.category) ?? { now: 0, avg: 0 };
      c.avg += Number(e.total) / monthsOfHistory;
      byCategory.set(e.category, c);
    }

    const rows = [...byCategory.entries()]
      .map(([category, v]) => ({
        category,
        label: CATEGORY_LABEL[category] ?? category,
        now: round2(v.now),
        avg: round2(v.avg),
        diff: round2(v.now - v.avg),
      }))
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    const total = round2(thisMonth.reduce((s, e) => s + Number(e.total), 0));
    const avgTotal = round2(rows.reduce((s, r) => s + r.avg, 0));

    // El gasto más grande del mes: suele ser el que explica la variación.
    const biggest = thisMonth.sort((a, b) => Number(b.total) - Number(a.total))[0];

    return { rows, total, avgTotal, diff: round2(total - avgTotal), biggest, monthsOfHistory };
  });
}

async function analyzeSuppliers(companyId: string, condominiumId: string) {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1));

  return withTenantContext(companyId, async (tx) => {
    const expenses = await tx.expense.findMany({
      where: { condominiumId, status: { in: ['aprobado', 'pagado'] }, issueDate: { gte: from } },
      select: { total: true, supplier: { select: { legalName: true, tradeName: true } } },
    });

    const bySupplier = new Map<string, number>();
    for (const e of expenses) {
      const name = e.supplier ? (e.supplier.tradeName ?? e.supplier.legalName) : 'Sin proveedor';
      bySupplier.set(name, (bySupplier.get(name) ?? 0) + Number(e.total));
    }

    const total = round2([...bySupplier.values()].reduce((s, v) => s + v, 0));
    const rows = [...bySupplier.entries()]
      .map(([name, amount]) => ({ name, amount: round2(amount), share: total > 0 ? amount / total : 0 }))
      .sort((a, b) => b.amount - a.amount);

    return { rows, total };
  });
}

// ============================================================
// Redactor propio — funciona sin la llave del modelo
// ============================================================

export async function ask(
  companyId: string,
  condominiumId: string,
  question: string
): Promise<AssistantAnswer> {
  const { intent } = classify(question);
  const suffix = `?condoId=${condominiumId}`;

  switch (intent) {
    // ---------- ¿Por qué aumentaron los gastos? ----------
    case 'gastos_variacion': {
      const d = await analyzeExpenses(companyId, condominiumId);
      if (d.rows.length === 0) {
        return {
          intent,
          headline: 'Todavía no hay gastos registrados en este condominio.',
          narrative:
            'No puedo comparar nada porque no hay gastos aprobados. Registrá los gastos del mes para que el análisis tenga con qué trabajar.',
          table: null,
          recommendations: [],
          actions: [{ label: 'Registrar un gasto', href: `/app/finanzas/gastos${suffix}` }],
          writtenBy: 'sistema',
        };
      }

      // Sin meses previos NO hay contra qué comparar. Decir "0 % de
      // variación" sería darle al administrador una certeza falsa: no
      // es que no haya cambiado, es que no se sabe.
      const sinHistorial = d.avgTotal <= 0;
      const subio = d.diff > 0;
      const variacion = sinHistorial ? 0 : (d.diff / d.avgTotal) * 100;
      const top = d.rows[0]!;

      const headline = sinHistorial
        ? `Los gastos del mes suman ${fmt(d.total)}. Todavía no hay meses anteriores con qué compararlos.`
        : subio
          ? `Los gastos del mes (${fmt(d.total)}) están ${pct(Math.abs(variacion))} por encima del promedio.`
          : `Los gastos del mes (${fmt(d.total)}) están ${pct(Math.abs(variacion))} por debajo del promedio.`;

      const puntual = !sinHistorial && d.biggest && Math.abs(Number(d.biggest.total)) >= Math.abs(d.diff) * 0.6;
      const recomendaciones: string[] = [];
      if (sinHistorial) {
        recomendaciones.push(
          'Con un solo mes de gastos registrados no se puede distinguir lo puntual de lo estructural. A partir del segundo mes el análisis compara contra el promedio.'
        );
      }
      if (puntual && d.biggest) {
        recomendaciones.push(
          `La mayor parte de la variación viene de un solo gasto: "${d.biggest.description}" por ${fmt(Number(d.biggest.total))}. Si es puntual, no representa una tendencia.`
        );
      }
      if (subio && Math.abs(variacion) > 20) {
        recomendaciones.push('Revisá la partida presupuestaria de la categoría que más creció antes de que cierre el año.');
      }

      const context = [
        `Pregunta: ${question}`,
        sinHistorial
          ? `Gasto del mes: ${fmt(d.total)}. NO hay meses previos registrados, así que no existe promedio con qué comparar. No inventes una variación.`
          : `Gasto del mes: ${fmt(d.total)}. Promedio de los ${d.monthsOfHistory} meses previos: ${fmt(d.avgTotal)}. Diferencia: ${fmt(d.diff)} (${pct(variacion)}).`,
        'Por categoría (mes / promedio / diferencia):',
        ...d.rows.map((r) => `- ${r.label}: ${fmt(r.now)} / ${fmt(r.avg)} / ${fmt(r.diff)}`),
        d.biggest ? `Gasto individual más grande del mes: "${d.biggest.description}" por ${fmt(Number(d.biggest.total))}.` : '',
      ].join('\n');

      const ia = await polish(context);

      return {
        intent,
        headline,
        narrative:
          ia ??
          (sinHistorial
            ? `${headline} El mayor rubro es ${top.label} con ${fmt(top.now)}.`
            : `${headline} La categoría con mayor variación es ${top.label}: pasó de ${fmt(top.avg)} en promedio a ${fmt(top.now)} este mes.${
                puntual && d.biggest ? ` Casi todo el cambio se explica por "${d.biggest.description}".` : ''
              }`),
        table: sinHistorial
          ? {
              title: 'Gasto por categoría',
              columns: ['Categoría', 'Este mes'],
              rows: d.rows.map((r) => [r.label, fmt(r.now)]),
            }
          : {
              title: 'Gasto por categoría',
              columns: ['Categoría', 'Este mes', 'Promedio', 'Diferencia'],
              rows: d.rows.map((r) => [r.label, fmt(r.now), fmt(r.avg), fmt(r.diff)]),
            },
        recommendations: recomendaciones,
        actions: [
          { label: 'Ver gastos', href: `/app/finanzas/gastos${suffix}` },
          { label: 'Ver presupuesto', href: `/app/finanzas/presupuesto${suffix}` },
        ],
        writtenBy: ia ? 'ia' : 'sistema',
      };
    }

    // ---------- ¿Quiénes presentan mayor morosidad? ----------
    case 'morosidad': {
      const v = await getCollectionsView(companyId, condominiumId);
      if (v.debtors.length === 0) {
        return {
          intent,
          headline: 'Ninguna filial está en mora.',
          narrative: 'Toda la cartera está al día. No hay gestión de cobro pendiente.',
          table: null,
          recommendations: [],
          actions: [{ label: 'Ver cobranza', href: `/app/finanzas/cobranza${suffix}` }],
          writtenBy: 'sistema',
        };
      }

      const top = v.debtors.slice(0, 8);
      const conConvenio = v.debtors.filter((d) => d.hasPlan).length;
      const criticos = v.debtors.filter((d) => d.oldestDays > 90);

      const headline = `${v.debtors.length} filial(es) en mora por ${fmt(v.aging.overdue)} — ${pct(v.aging.overdueRatio * 100)} de la cartera.`;

      const recomendaciones: string[] = [];
      if (criticos.length > 0) {
        recomendaciones.push(
          `${criticos.length} filial(es) superan los 90 días (${criticos.map((c) => c.code).join(', ')}). Corresponde preparar el expediente de cobro judicial.`
        );
      }
      if (conConvenio > 0) {
        recomendaciones.push(`${conConvenio} tienen convenio vigente: no devengan intereses ni reciben avisos mientras cumplan.`);
      }
      if (v.collectionRate < 0.75) {
        recomendaciones.push(`La recuperación del mes va en ${pct(v.collectionRate * 100)}. Conviene reforzar la gestión antes del cierre.`);
      }

      const context = [
        `Pregunta: ${question}`,
        `Cartera total: ${fmt(v.aging.total)}. Vencida: ${fmt(v.aging.overdue)} (${pct(v.aging.overdueRatio * 100)}).`,
        `Filiales en mora: ${v.debtors.length}. Con convenio vigente: ${conConvenio}. Con más de 90 días: ${criticos.length}.`,
        `Recuperación del mes: ${pct(v.collectionRate * 100)}.`,
        'Mayores deudores (filial / monto / días de mora):',
        ...top.map((d) => `- ${d.code}${d.ownerName ? ` (${d.ownerName})` : ''}: ${fmt(d.total)} / ${d.oldestDays} días`),
      ].join('\n');

      const ia = await polish(context);

      return {
        intent,
        headline,
        narrative:
          ia ??
          `${headline} El caso más antiguo es ${top[0]!.code} con ${top[0]!.oldestDays} días y ${fmt(top[0]!.total)}. La recuperación del mes va en ${pct(v.collectionRate * 100)}.`,
        table: {
          title: 'Mayores deudores',
          columns: ['Filial', 'Propietario', 'Debe', 'Días', 'Estado'],
          rows: top.map((d) => [
            d.code,
            d.ownerName ?? '—',
            fmt(d.total),
            d.oldestDays,
            d.hasPlan ? 'Convenio vigente' : (d.suggestedStep?.label ?? '—'),
          ]),
        },
        recommendations: recomendaciones,
        actions: [{ label: 'Ir a cobranza', href: `/app/finanzas/cobranza${suffix}` }],
        writtenBy: ia ? 'ia' : 'sistema',
      };
    }

    // ---------- ¿Qué proveedores representan el mayor gasto? ----------
    case 'proveedores': {
      const d = await analyzeSuppliers(companyId, condominiumId);
      if (d.rows.length === 0) {
        return {
          intent,
          headline: 'No hay gastos con proveedor registrados.',
          narrative: 'Registrá los gastos con su proveedor para poder analizar la concentración.',
          table: null,
          recommendations: [],
          actions: [{ label: 'Ver gastos', href: `/app/finanzas/gastos${suffix}` }],
          writtenBy: 'sistema',
        };
      }

      const top = d.rows.slice(0, 8);
      const first = top[0]!;
      const concentrado = first.share > 0.3;

      const headline = `${first.name} concentra ${pct(first.share * 100)} del gasto del último año (${fmt(first.amount)}).`;

      const recomendaciones: string[] = [];
      if (concentrado) {
        recomendaciones.push(
          `Un proveedor con más del 30 % del gasto es una dependencia. Conviene tener al menos una cotización alternativa vigente.`
        );
      }
      const sinProveedor = d.rows.find((r) => r.name === 'Sin proveedor');
      if (sinProveedor && sinProveedor.share > 0.15) {
        recomendaciones.push(
          `${pct(sinProveedor.share * 100)} del gasto está registrado sin proveedor. Asignarlo mejora la trazabilidad y el análisis.`
        );
      }

      const context = [
        `Pregunta: ${question}`,
        `Gasto total del último año: ${fmt(d.total)}.`,
        'Por proveedor (nombre / monto / participación):',
        ...top.map((r) => `- ${r.name}: ${fmt(r.amount)} / ${pct(r.share * 100)}`),
      ].join('\n');

      const ia = await polish(context);

      return {
        intent,
        headline,
        narrative:
          ia ??
          `${headline} Los ${Math.min(3, top.length)} principales suman ${pct(top.slice(0, 3).reduce((s, r) => s + r.share, 0) * 100)} del gasto total.`,
        table: {
          title: 'Gasto por proveedor (últimos 12 meses)',
          columns: ['Proveedor', 'Monto', 'Participación'],
          rows: top.map((r) => [r.name, fmt(r.amount), pct(r.share * 100)]),
        },
        recommendations: recomendaciones,
        actions: [{ label: 'Ver gastos', href: `/app/finanzas/gastos${suffix}` }],
        writtenBy: ia ? 'ia' : 'sistema',
      };
    }

    // ---------- ¿Qué presupuesto está excedido? ----------
    case 'presupuesto': {
      const b = await getBudget(companyId, condominiumId, new Date().getUTCFullYear());
      const conPresupuesto = b.rows.filter((r) => r.budgeted > 0);

      if (conPresupuesto.length === 0) {
        return {
          intent,
          headline: 'Este condominio todavía no tiene presupuesto cargado.',
          narrative:
            'Sin presupuesto no hay contra qué comparar el gasto. Podés generarlo desde el gasto real del año anterior en un par de clics.',
          table: null,
          recommendations: [],
          actions: [{ label: 'Configurar presupuesto', href: `/app/finanzas/presupuesto${suffix}` }],
          writtenBy: 'sistema',
        };
      }

      const excedidas = conPresupuesto.filter((r) => r.percent >= 100);
      const enRiesgo = conPresupuesto.filter((r) => r.percent >= 80 && r.percent < 100);
      const avanceAno = b.yearProgress * 100;

      const headline =
        excedidas.length > 0
          ? `${excedidas.length} partida(s) superaron su presupuesto anual.`
          : `Ninguna partida está excedida. El año va en ${pct(avanceAno)} y la ejecución en ${pct(b.totalBudgeted > 0 ? (b.totalExecuted / b.totalBudgeted) * 100 : 0)}.`;

      const recomendaciones: string[] = [];
      for (const r of excedidas) {
        const proyeccion = b.yearProgress > 0.1 ? r.executed / b.yearProgress : r.executed;
        recomendaciones.push(
          `${r.name} va en ${pct(r.percent)}. Al ritmo actual cerraría el año en ${fmt(round2(proyeccion))}, contra ${fmt(r.budgeted)} aprobados.`
        );
      }
      if (enRiesgo.length > 0 && avanceAno < 70) {
        recomendaciones.push(
          `${enRiesgo.map((r) => r.name).join(', ')} superan el 80 % con solo ${pct(avanceAno)} del año transcurrido.`
        );
      }

      const context = [
        `Pregunta: ${question}`,
        `Año transcurrido: ${pct(avanceAno)}. Presupuestado: ${fmt(b.totalBudgeted)}. Ejecutado: ${fmt(b.totalExecuted)}.`,
        'Partidas (nombre / presupuesto / ejecutado / %):',
        ...conPresupuesto.map((r) => `- ${r.name}: ${fmt(r.budgeted)} / ${fmt(r.executed)} / ${pct(r.percent)}`),
      ].join('\n');

      const ia = await polish(context);

      return {
        intent,
        headline,
        narrative:
          ia ??
          `${headline} El año va en ${pct(avanceAno)} y la ejecución global en ${pct(b.totalBudgeted > 0 ? (b.totalExecuted / b.totalBudgeted) * 100 : 0)}, así que el ritmo general ${b.totalExecuted / (b.totalBudgeted || 1) > b.yearProgress ? 'va por encima de lo previsto' : 'está dentro de lo previsto'}.`,
        table: {
          title: 'Ejecución presupuestaria',
          columns: ['Partida', 'Presupuesto', 'Ejecutado', 'Avance'],
          rows: conPresupuesto
            .sort((a, b2) => b2.percent - a.percent)
            .map((r) => [r.name, fmt(r.budgeted), fmt(r.executed), pct(r.percent)]),
        },
        recommendations: recomendaciones,
        actions: [{ label: 'Ver presupuesto', href: `/app/finanzas/presupuesto${suffix}` }],
        writtenBy: ia ? 'ia' : 'sistema',
      };
    }

    // ---------- ¿Qué pagos requieren aprobación? ----------
    case 'aprobaciones': {
      const pendientes = await withTenantContext(companyId, (tx) =>
        tx.expense.findMany({
          where: { condominiumId, status: { in: ['por_aprobar', 'borrador'] } },
          orderBy: { issueDate: 'asc' },
          include: {
            supplier: { select: { legalName: true, tradeName: true } },
            createdBy: { select: { fullName: true } },
          },
        })
      );

      if (pendientes.length === 0) {
        return {
          intent,
          headline: 'No hay nada esperando aprobación.',
          narrative: 'Todos los gastos registrados están aprobados o pagados.',
          table: null,
          recommendations: [],
          actions: [{ label: 'Ver gastos', href: `/app/finanzas/gastos${suffix}` }],
          writtenBy: 'sistema',
        };
      }

      const total = round2(pendientes.reduce((s, e) => s + Number(e.total), 0));
      const hoy = Date.now();
      const masViejo = Math.floor((hoy - pendientes[0]!.issueDate.getTime()) / 86_400_000);

      const headline = `${pendientes.length} gasto(s) esperan aprobación por ${fmt(total)}.`;

      const recomendaciones: string[] = [];
      if (masViejo > 15) {
        recomendaciones.push(
          `El más antiguo lleva ${masViejo} días sin resolverse. Mientras no se aprueben, no aparecen en el Estado de Resultados y el gasto del mes se ve más bajo de lo real.`
        );
      }
      const borradores = pendientes.filter((e) => e.status === 'borrador');
      if (borradores.length > 0) {
        recomendaciones.push(
          `${borradores.length} son borradores generados automáticamente desde gastos recurrentes: hay que revisarles el monto antes de aprobarlos.`
        );
      }

      const context = [
        `Pregunta: ${question}`,
        `Gastos pendientes: ${pendientes.length}. Monto total: ${fmt(total)}. El más antiguo lleva ${masViejo} días.`,
        'Detalle (número / descripción / proveedor / monto / estado):',
        ...pendientes.map(
          (e) =>
            `- #${e.expenseNumber} ${e.description} / ${e.supplier ? (e.supplier.tradeName ?? e.supplier.legalName) : 'sin proveedor'} / ${fmt(Number(e.total))} / ${e.status}`
        ),
      ].join('\n');

      const ia = await polish(context);

      return {
        intent,
        headline,
        narrative:
          ia ??
          `${headline} El más antiguo lleva ${masViejo} días esperando. Mientras no se aprueben, no afectan el Estado de Resultados.`,
        table: {
          title: 'Gastos pendientes de aprobación',
          columns: ['N.º', 'Descripción', 'Proveedor', 'Monto', 'Estado'],
          rows: pendientes.map((e) => [
            `#${e.expenseNumber}`,
            e.description,
            e.supplier ? (e.supplier.tradeName ?? e.supplier.legalName) : '—',
            fmt(Number(e.total)),
            e.status === 'por_aprobar' ? 'Por aprobar' : 'Borrador',
          ]),
        },
        recommendations: recomendaciones,
        actions: [{ label: 'Aprobar gastos', href: `/app/finanzas/gastos${suffix}` }],
        writtenBy: ia ? 'ia' : 'sistema',
      };
    }

    // ---------- ¿Cómo mejorar la liquidez? ----------
    case 'liquidez': {
      const [flow, collections, banks] = await Promise.all([
        getCashFlow(companyId, condominiumId, { history: 6, forecast: 3 }),
        getCollectionsView(companyId, condominiumId),
        listBankAccountsWithBalance(companyId, condominiumId),
      ]);

      const saldo = round2(banks.reduce((s, b) => s + b.balance, 0));
      const meses = flow.runwayMonths;

      const headline =
        meses === null
          ? `El saldo en bancos es ${fmt(saldo)}.`
          : `El saldo en bancos (${fmt(saldo)}) cubre ${meses.toFixed(1)} mes(es) de operación.`;

      // Las recomendaciones se ordenan por impacto real, calculado.
      const recomendaciones: string[] = [];
      if (collections.aging.overdue > 0) {
        recomendaciones.push(
          `Cobrar la cartera vencida sumaría ${fmt(collections.aging.overdue)} — es la palanca más grande que tenés hoy.`
        );
      }
      if (collections.collectionRate < 0.9) {
        recomendaciones.push(
          `La recuperación va en ${pct(collections.collectionRate * 100)}. Subirla al 90 % aportaría cerca de ${fmt(round2(flow.averageExpense * (0.9 - collections.collectionRate)))} al mes.`
        );
      }
      if (meses !== null && meses < 2) {
        recomendaciones.push('Con menos de dos meses cubiertos, conviene postergar los gastos no urgentes y revisar el calendario de pagos.');
      }
      if (banks.length === 0) {
        recomendaciones.push('No hay cuentas bancarias registradas, así que el saldo no se puede verificar contra el banco.');
      }

      const context = [
        `Pregunta: ${question}`,
        `Saldo en bancos: ${fmt(saldo)} en ${banks.length} cuenta(s).`,
        `Gasto mensual promedio: ${fmt(flow.averageExpense)}. Meses cubiertos: ${meses !== null ? meses.toFixed(1) : 'no calculable'}.`,
        `Cartera vencida por cobrar: ${fmt(collections.aging.overdue)}. Recuperación del mes: ${pct(collections.collectionRate * 100)}.`,
        `Tasa de recuperación histórica: ${pct(flow.collectionRate * 100)}.`,
      ].join('\n');

      const ia = await polish(context);

      return {
        intent,
        headline,
        narrative:
          ia ??
          `${headline} El gasto mensual promedio es ${fmt(flow.averageExpense)} y quedan ${fmt(collections.aging.overdue)} de cartera vencida por cobrar.`,
        table: {
          title: 'Situación de liquidez',
          columns: ['Concepto', 'Monto'],
          rows: [
            ['Saldo en bancos', fmt(saldo)],
            ['Gasto mensual promedio', fmt(flow.averageExpense)],
            ['Cartera vencida por cobrar', fmt(collections.aging.overdue)],
            ['Meses de operación cubiertos', meses !== null ? meses.toFixed(1) : '—'],
          ],
        },
        recommendations: recomendaciones,
        actions: [
          { label: 'Ver flujo de caja', href: `/app/finanzas/flujo${suffix}` },
          { label: 'Ir a cobranza', href: `/app/finanzas/cobranza${suffix}` },
        ],
        writtenBy: ia ? 'ia' : 'sistema',
      };
    }

    // ---------- Ingresos ----------
    case 'ingresos': {
      const flow = await getCashFlow(companyId, condominiumId, { history: 6, forecast: 0 });
      const real = flow.months.filter((m) => !m.projected);
      const ultimo = real[real.length - 1];
      const anterior = real[real.length - 2];
      const variacion =
        ultimo && anterior && anterior.income > 0
          ? ((ultimo.income - anterior.income) / anterior.income) * 100
          : null;

      const headline = `Los ingresos del mes son ${fmt(ultimo?.income ?? 0)}.`;
      const context = [
        `Pregunta: ${question}`,
        `Ingresos por mes: ${real.map((m) => `${m.label}: ${fmt(m.income)}`).join(', ')}.`,
        `Tasa de recuperación histórica: ${pct(flow.collectionRate * 100)}.`,
      ].join('\n');
      const ia = await polish(context);

      return {
        intent,
        headline,
        narrative:
          ia ??
          `${headline}${variacion !== null ? ` Eso es ${pct(Math.abs(variacion))} ${variacion >= 0 ? 'más' : 'menos'} que el mes anterior.` : ''} La tasa de recuperación histórica es de ${pct(flow.collectionRate * 100)}.`,
        table: {
          title: 'Ingresos por mes',
          columns: ['Mes', 'Ingresos'],
          rows: real.map((m) => [m.label, fmt(m.income)]),
        },
        recommendations: [],
        actions: [{ label: 'Ver flujo de caja', href: `/app/finanzas/flujo${suffix}` }],
        writtenBy: ia ? 'ia' : 'sistema',
      };
    }

    // ---------- Resumen general ----------
    default: {
      const [flow, collections, banks] = await Promise.all([
        getCashFlow(companyId, condominiumId, { history: 6, forecast: 0 }),
        getCollectionsView(companyId, condominiumId),
        listBankAccountsWithBalance(companyId, condominiumId),
      ]);
      const real = flow.months.filter((m) => !m.projected);
      const ultimo = real[real.length - 1];
      const saldo = round2(banks.reduce((s, b) => s + b.balance, 0));

      const headline = `Ingresos ${fmt(ultimo?.income ?? 0)} · gastos ${fmt(ultimo?.expense ?? 0)} · en bancos ${fmt(saldo)}.`;

      const context = [
        `Pregunta: ${question}`,
        `Ingresos del mes: ${fmt(ultimo?.income ?? 0)}. Gastos del mes: ${fmt(ultimo?.expense ?? 0)}. Resultado: ${fmt((ultimo?.income ?? 0) - (ultimo?.expense ?? 0))}.`,
        `Saldo en bancos: ${fmt(saldo)}. Morosidad: ${pct(collections.aging.overdueRatio * 100)} (${fmt(collections.aging.overdue)}).`,
        `Filiales en mora: ${collections.debtors.length}. Recuperación del mes: ${pct(collections.collectionRate * 100)}.`,
      ].join('\n');

      const ia = await polish(context);

      return {
        intent: 'resumen',
        headline,
        narrative:
          ia ??
          `${headline} La morosidad está en ${pct(collections.aging.overdueRatio * 100)} con ${collections.debtors.length} filial(es) en mora, y la recuperación del mes va en ${pct(collections.collectionRate * 100)}.`,
        table: {
          title: 'Situación del mes',
          columns: ['Concepto', 'Valor'],
          rows: [
            ['Ingresos', fmt(ultimo?.income ?? 0)],
            ['Gastos', fmt(ultimo?.expense ?? 0)],
            ['Resultado', fmt((ultimo?.income ?? 0) - (ultimo?.expense ?? 0))],
            ['Saldo en bancos', fmt(saldo)],
            ['Morosidad', pct(collections.aging.overdueRatio * 100)],
            ['Recuperación del mes', pct(collections.collectionRate * 100)],
          ],
        },
        recommendations: [],
        actions: [{ label: 'Ver panel financiero', href: `/app/finanzas/panel${suffix}` }],
        writtenBy: ia ? 'ia' : 'sistema',
      };
    }
  }
}

/** ¿El modelo de lenguaje está disponible en este entorno? */
export function assistantHasAI(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
