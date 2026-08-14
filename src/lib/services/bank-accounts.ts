import { withTenantContext } from '@/lib/db';
import { round2 } from '@/lib/domain/late-interest';

/**
 * Cuentas bancarias del condominio.
 *
 * El saldo NO se guarda en la tabla: se calcula como saldo de apertura
 * más los movimientos contabilizados en su cuenta contable espejo.
 * Guardar un saldo lo condenaría a desincronizarse del libro diario.
 */

export async function listBankAccounts(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.bankAccount.findMany({
      where: { condominiumId, isActive: true },
      orderBy: { name: 'asc' },
    })
  );
}

export type BankAccountWithBalance = Awaited<ReturnType<typeof listBankAccounts>>[number] & {
  balance: number;
};

/** Saldo derivado del libro diario. */
export async function listBankAccountsWithBalance(
  companyId: string,
  condominiumId: string
): Promise<BankAccountWithBalance[]> {
  return withTenantContext(companyId, async (tx) => {
    const accounts = await tx.bankAccount.findMany({
      where: { condominiumId, isActive: true },
      orderBy: { name: 'asc' },
    });

    const out: BankAccountWithBalance[] = [];
    for (const account of accounts) {
      const chart = await tx.chartOfAccount.findUnique({
        where: { condominiumId_code: { condominiumId, code: account.accountCode } },
        select: { id: true },
      });

      let movement = 0;
      if (chart) {
        const agg = await tx.journalLine.aggregate({
          where: {
            accountId: chart.id,
            entry: {
              condominiumId,
              status: 'confirmado',
              entryDate: { gte: account.openingDate },
            },
          },
          _sum: { debit: true, credit: true },
        });
        // Una cuenta de banco es de activo: los débitos suman.
        movement = Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0);
      }

      out.push({ ...account, balance: round2(Number(account.openingBalance) + movement) });
    }
    return out;
  });
}

export async function createBankAccount(
  companyId: string,
  input: {
    condominiumId: string;
    name: string;
    bankName: string;
    accountNumber: string;
    iban?: string;
    currency: string;
    accountCode: string;
    openingBalance: number;
    openingDate: Date;
  }
) {
  return withTenantContext(companyId, async (tx) => {
    // La cuenta contable espejo tiene que existir: si no, los asientos
    // de pago fallarían más adelante con un error incomprensible.
    const chart = await tx.chartOfAccount.findUnique({
      where: { condominiumId_code: { condominiumId: input.condominiumId, code: input.accountCode } },
    });
    if (!chart) throw new Error(`La cuenta contable ${input.accountCode} no existe en el plan de cuentas.`);
    if (chart.type !== 'activo') throw new Error(`La cuenta ${input.accountCode} no es una cuenta de activo.`);

    return tx.bankAccount.create({ data: { companyId, ...input, iban: input.iban || null } });
  });
}

export async function updateBankAccount(
  companyId: string,
  id: string,
  input: { name: string; bankName: string; accountNumber: string; iban?: string; isActive: boolean }
) {
  return withTenantContext(companyId, (tx) =>
    tx.bankAccount.update({ where: { id }, data: { ...input, iban: input.iban || null } })
  );
}

/** Cuentas de activo disponibles para usar como espejo contable. */
export async function listAssetAccounts(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.chartOfAccount.findMany({
      where: { condominiumId, type: 'activo', sub: 'corriente' },
      select: { code: true, name: true },
      orderBy: { code: 'asc' },
    })
  );
}
