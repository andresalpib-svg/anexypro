import type { Prisma } from '@prisma/client';

/**
 * Plan de cuentas de arranque de una empresa administradora.
 *
 * POR QUÉ VIVE AQUÍ Y NO EN EL SEED. Estaba solo en `prisma/seed.ts`,
 * o sea que únicamente la empresa de arranque lo tenía. Cualquier
 * empresa dada de alta desde el panel master nacía SIN plan contable, y
 * eso no se nota hasta el primer intento de facturar: el motor de
 * partida doble busca la cuenta 1101 al emitir un cargo y aborta con
 * "Cuenta contable 1101 no existe para esta empresa". Es decir, una
 * administradora recién creada no podía cobrarle a nadie.
 *
 * Ahora el alta de empresas lo crea en la misma transacción, con el
 * mismo criterio que ya se aplicaba al administrador: una empresa sin
 * plan de cuentas no sirve, así que no debe poder existir.
 */
export const CHART_OF_ACCOUNTS: Array<{
  code: string;
  name: string;
  type: 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'gasto';
  sub?: 'corriente' | 'no_corriente';
  isOperating?: boolean;
}> = [
  { code: '1001', name: 'Banco Cuenta Corriente', type: 'activo', sub: 'corriente' },
  { code: '1101', name: 'Cuotas por Cobrar', type: 'activo', sub: 'corriente' },
  { code: '1200', name: 'Fondo de Reserva', type: 'activo', sub: 'corriente' },
  { code: '1501', name: 'Activos Fijos e Instalaciones', type: 'activo', sub: 'no_corriente' },
  { code: '2001', name: 'Proveedores por Pagar', type: 'pasivo', sub: 'corriente' },
  { code: '2002', name: 'Adelantos de Condóminos', type: 'pasivo', sub: 'corriente' },
  { code: '2003', name: 'Depósitos sin Identificar', type: 'pasivo', sub: 'corriente' },
  { code: '2101', name: 'Documentos por Pagar (Largo Plazo)', type: 'pasivo', sub: 'no_corriente' },
  { code: '3001', name: 'Superávit Acumulado', type: 'patrimonio' },
  { code: '3002', name: 'Superávit del Período', type: 'patrimonio' },
  { code: '3003', name: 'Reserva Legal', type: 'patrimonio' },
  { code: '4001', name: 'Ingresos por Cuota Condominal', type: 'ingreso', isOperating: true },
  { code: '4101', name: 'Ingresos por Cuota Extraordinaria', type: 'ingreso', isOperating: false },
  { code: '4201', name: 'Ingresos por Agua', type: 'ingreso', isOperating: true },
  { code: '4202', name: 'Ingresos por Multas', type: 'ingreso', isOperating: true },
  { code: '4203', name: 'Ingresos por Reservas de Áreas Comunes', type: 'ingreso', isOperating: true },
  { code: '4901', name: 'Otros Ingresos', type: 'ingreso', isOperating: false },
  { code: '5001', name: 'Mantenimiento de Áreas Verdes', type: 'gasto' },
  { code: '5002', name: 'Mantenimiento de Equipos', type: 'gasto' },
  { code: '5003', name: 'Mantenimiento General', type: 'gasto' },
  { code: '5101', name: 'Honorarios de Administración', type: 'gasto' },
  { code: '5102', name: 'Papelería y Suministros', type: 'gasto' },
  { code: '5103', name: 'Comisiones Bancarias', type: 'gasto' },
  { code: '5200', name: 'Seguros', type: 'gasto' },
  { code: '5301', name: 'Electricidad', type: 'gasto' },
  { code: '5302', name: 'Agua (servicio)', type: 'gasto' },
  { code: '5303', name: 'Seguridad', type: 'gasto' },
  { code: '5400', name: 'Gastos de Proyectos', type: 'gasto' },
  { code: '5500', name: 'Gastos Varios', type: 'gasto' },
  { code: '5901', name: 'Gastos Financieros', type: 'gasto', isOperating: false },
];

/**
 * Crea el plan de cuentas de la empresa si todavía no lo tiene.
 *
 * Idempotente a propósito: sirve tanto para el alta de una empresa
 * nueva como para poner al día una que se creó antes de este arreglo.
 * Devuelve cuántas cuentas creó.
 */
export async function ensureChartOfAccounts(
  tx: Prisma.TransactionClient,
  companyId: string
): Promise<number> {
  const existentes = await tx.chartOfAccount.findMany({
    where: { companyId },
    select: { code: true },
  });
  const yaEstan = new Set(existentes.map((c) => c.code));
  const faltantes = CHART_OF_ACCOUNTS.filter((c) => !yaEstan.has(c.code));
  if (faltantes.length === 0) return 0;

  await tx.chartOfAccount.createMany({
    data: faltantes.map((a) => ({ ...a, companyId, isSystem: true })),
  });
  return faltantes.length;
}
