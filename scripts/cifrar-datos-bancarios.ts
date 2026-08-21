/**
 * Cifra en el lugar el número de cuenta, el IBAN y la cuenta bancaria
 * del proveedor que ya existan en texto plano — ver
 * src/lib/crypto/field-encryption.ts.
 *
 *   npx tsx scripts/cifrar-datos-bancarios.ts
 *
 * IDEMPOTENTE: una fila que ya empiece con "enc:v1:" se salta. Correrlo
 * dos veces (o contra una base recién migrada) no hace nada la segunda
 * vez.
 *
 * Usa un PrismaClient SIN la extensión de cifrado (importa `@prisma/client`
 * directo, no `@/lib/db`): si usara la extensión, leer una fila ya en
 * texto plano la "descifraría" tal cual (comportamiento a propósito de
 * `decryptField` con datos heredados) y after volver a escribirla la
 * cifraría igual — funcionaría por accidente. Yendo directo, el
 * cifrado/descifrado de este script es explícito y se entiende leyendo
 * el código, no la extensión de otro archivo.
 *
 * Sale por DIRECT_URL (el dueño): UPDATE en lote sobre datos de TODAS
 * las empresas, no una operación de la aplicación con RLS.
 */
import { PrismaClient } from '@prisma/client';
import { encryptField, estaCifrado } from '../src/lib/crypto/field-encryption';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

async function main() {
  if (!process.env.FIELD_ENCRYPTION_KEY) {
    console.error('Falta FIELD_ENCRYPTION_KEY. Generar una con: openssl rand -base64 32');
    process.exitCode = 1;
    return;
  }

  let cuentasMigradas = 0;
  const cuentas = await prisma.bankAccount.findMany({
    select: { id: true, accountNumber: true, iban: true },
  });
  for (const c of cuentas) {
    const data: { accountNumber?: string; iban?: string | null } = {};
    if (!estaCifrado(c.accountNumber)) data.accountNumber = encryptField(c.accountNumber)!;
    if (c.iban && !estaCifrado(c.iban)) data.iban = encryptField(c.iban);
    if (Object.keys(data).length > 0) {
      await prisma.bankAccount.update({ where: { id: c.id }, data });
      cuentasMigradas++;
    }
  }

  let proveedoresMigrados = 0;
  const proveedores = await prisma.supplier.findMany({
    where: { bankAccount: { not: null } },
    select: { id: true, bankAccount: true },
  });
  for (const p of proveedores) {
    if (p.bankAccount && !estaCifrado(p.bankAccount)) {
      await prisma.supplier.update({
        where: { id: p.id },
        data: { bankAccount: encryptField(p.bankAccount) },
      });
      proveedoresMigrados++;
    }
  }

  console.log(`Cuentas bancarias cifradas: ${cuentasMigradas} de ${cuentas.length}`);
  console.log(`Proveedores cifrados: ${proveedoresMigrados} de ${proveedores.length}`);
  console.log('\nVerificar con: npx tsx scripts/verificar-bd.ts');
}

main()
  .catch((e) => {
    console.error('No se pudo cifrar:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
