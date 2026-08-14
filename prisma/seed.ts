import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// El plan de cuentas (chart_of_accounts) ya NO se siembra acá: desde
// 2026-08-13 es por CONDOMINIO, no por empresa (ver
// src/lib/services/chart-of-accounts.ts), y este seed a propósito no
// crea ningún condominio ("base de datos limpia"). `createCondominium`
// lo crea automáticamente en cuanto la administración da de alta su
// primer condominio.

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

  console.log('Empresa y usuario administrador creados.');
  console.log(`  Correo:     ${email}`);
  console.log(`  Contraseña: ${password}`);
  console.log('  ⚠️  Cambia esta contraseña de inmediato después del primer ingreso.');
  console.log('Sin condominios, propiedades ni datos de demostración — base de datos limpia, como se pidió.');
  console.log('El plan de cuentas se crea solo al dar de alta el primer condominio.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
