/**
 * Usuarios de PRUEBA para validar la seguridad por roles.
 * Ejecutar:  npx tsx prisma/test-users-seed.ts   (re-ejecutable)
 *
 *   api@anexypro.com           / 123456789       → Panel Master (plataforma)
 *   administrador@anexypro.com / Admin123*       → Panel Administradora completo
 *   supervisor@anexypro.com    / Supervisor123*  → Staff con permisos parciales
 *   condomino@anexypro.com     / Condomino123*   → Ecosistema Condómino
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Supervisor: área operativa sí, área financiera/sensible no.
const SUPERVISOR_PERMISSIONS = {
  finanzas: false,
  contabilidad: false,
  reportes: false,
  auditoria: false,
  asistentesia: false,
  // mantenimientos, proyectos, seguridad, comunicados, documentos,
  // asambleas: permitidos (ausente = permitido)
};

async function upsertUser(
  companyId: string,
  email: string,
  password: string,
  fullName: string,
  role: 'master' | 'admin_owner' | 'admin_staff' | 'condomino',
  staffPermissions?: object
) {
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findFirst({ where: { companyId, email: { equals: email, mode: 'insensitive' } } });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, fullName, role, staffPermissions: staffPermissions ?? undefined },
    });
  }
  return prisma.user.create({
    data: { companyId, email, passwordHash, fullName, role, staffPermissions: staffPermissions ?? undefined },
  });
}

async function main() {
  const company = await prisma.company.findFirstOrThrow();

  // El master es único en toda la plataforma (índice único parcial en
  // 04_master_unico.sql): si el correo de aquí no coincide con el del
  // master real, este upsert intentaría crear un SEGUNDO master y el
  // sembrado moriría con una violación de restricción.
  await upsertUser(company.id, 'api@anexypro.com', '123456789', 'Usuario Master', 'master');
  await upsertUser(company.id, 'administrador@anexypro.com', 'Admin123*', 'Administrador Principal', 'admin_owner');
  await upsertUser(company.id, 'supervisor@anexypro.com', 'Supervisor123*', 'Supervisor Operativo', 'admin_staff', SUPERVISOR_PERMISSIONS);

  // Condómino: necesita una Person vinculada a una unidad para que su
  // portal funcione. Se usa una casa libre del condominio demo.
  const condomino = await upsertUser(company.id, 'condomino@anexypro.com', 'Condomino123*', 'Condómino de Prueba', 'condomino');
  const linked = await prisma.person.findFirst({ where: { userId: condomino.id } });
  if (!linked) {
    const demoCondo = await prisma.condominium.findFirstOrThrow({ where: { companyId: company.id, name: { contains: 'Altamar' } } });
    const freeUnit =
      (await prisma.property.findFirst({
        where: { condominiumId: demoCondo.id, members: { none: { endDate: null } } },
        orderBy: { code: 'asc' },
      })) ??
      (await prisma.property.findFirstOrThrow({ where: { condominiumId: demoCondo.id }, orderBy: { code: 'asc' } }));
    const person = await prisma.person.create({
      data: { companyId: company.id, fullName: 'Condómino de Prueba', email: 'condomino@anexypro.com', userId: condomino.id },
    });
    await prisma.propertyMember.create({
      data: { propertyId: freeUnit.id, personId: person.id, role: 'propietario', isPrimary: true },
    });
    console.log(`Condómino vinculado a ${freeUnit.code} (${demoCondo.name}).`);
  }

  console.log('✅ Usuarios de prueba listos:');
  console.log('   api@anexypro.com           / 123456789');
  console.log('   administrador@anexypro.com / Admin123*');
  console.log('   supervisor@anexypro.com    / Supervisor123*  (sin finanzas/contabilidad/reportes/auditoría/IA)');
  console.log('   condomino@anexypro.com     / Condomino123*');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
