import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Plan de cuentas estándar para condominios — mismo catálogo que el
// prototipo validó en Contabilidad Inteligente (ver
// diseno-modulo-15-contabilidad.md). Es plantilla del sistema
// (isSystem=true), no "datos demo": toda empresa nueva la necesita
// para que el motor de partida doble funcione desde el día uno.
const CHART_OF_ACCOUNTS: Array<{
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

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@tuempresa.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'CambiaEstaClave123!';
  const companyName = process.env.SEED_COMPANY_NAME ?? 'Mi Empresa Administradora';

  const existing = await prisma.company.findFirst();
  if (existing) {
    console.log('Ya existe al menos una empresa — el seed de arranque no se repite. Nada que hacer.');
    return;
  }

  const company = await prisma.company.create({
    data: { legalName: companyName },
  });

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      companyId: company.id,
      email,
      passwordHash,
      fullName: 'Administrador',
      role: 'admin_owner',
    },
  });

  await prisma.chartOfAccount.createMany({
    data: CHART_OF_ACCOUNTS.map((a) => ({ ...a, companyId: company.id, isSystem: true })),
  });

  console.log('Empresa y usuario administrador creados.');
  console.log(`  Correo:     ${email}`);
  console.log(`  Contraseña: ${password}`);
  console.log('  ⚠️  Cambia esta contraseña de inmediato después del primer ingreso.');
  console.log(`Plan de cuentas: ${CHART_OF_ACCOUNTS.length} cuentas creadas para "${companyName}".`);
  console.log('Sin condominios, propiedades ni datos de demostración — base de datos limpia, como se pidió.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
