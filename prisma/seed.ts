import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
// El plan de cuentas vive en el servicio para que el alta de empresas
// desde el panel master y este seed no puedan divergir.
import { CHART_OF_ACCOUNTS, ensureChartOfAccounts } from '../src/lib/services/chart-of-accounts';

const prisma = new PrismaClient();

// Plan de cuentas estándar para condominios — mismo catálogo que el
// prototipo validó en Contabilidad Inteligente (ver
// diseno-modulo-15-contabilidad.md). Es plantilla del sistema
// (isSystem=true), no "datos demo": toda empresa nueva la necesita
// para que el motor de partida doble funcione desde el día uno.

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

  await prisma.$transaction((tx) => ensureChartOfAccounts(tx, company.id));

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
