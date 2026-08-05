import { withTenantContext } from '@/lib/db';

export type CompanyOverview = {
  condos_count: bigint;
  condos_active: bigint;
  units_count: bigint;
};

export type CondoFinanceKpi = {
  condominium_id: string;
  total_units: bigint;
  units_current: bigint;
  units_delinquent: bigint;
};

export type RecentActivity = {
  id: bigint;
  property_code: string | null;
  event_type: string;
  description: string;
  created_at: Date;
};

// Las funciones de este servicio consultan directamente las vistas
// SQL de prisma/sql/01_views_functions_triggers.sql — es la misma
// lógica que existiría si se recalculara en TypeScript (ver el
// comentario en ese archivo), pero para reportes/KPIs agregados es
// más simple y más rápido dejar que Postgres haga el trabajo.
export async function getCompanyOverview(companyId: string): Promise<CompanyOverview | null> {
  const rows = await withTenantContext(companyId, (tx) =>
    tx.$queryRaw<CompanyOverview[]>`
      SELECT * FROM v_company_overview WHERE company_id = ${companyId}
    `
  );
  return rows[0] ?? { condos_count: 0n, condos_active: 0n, units_count: 0n };
}

export async function getCondoFinanceKpis(companyId: string): Promise<CondoFinanceKpi[]> {
  return withTenantContext(
    companyId,
    (tx) => tx.$queryRaw<CondoFinanceKpi[]>`
      SELECT k.* FROM v_condo_finance_kpis k
      JOIN condominiums c ON c.id = k.condominium_id
      WHERE c.company_id = ${companyId}
    `
  );
}

export async function getRecentActivity(companyId: string, limit = 8): Promise<RecentActivity[]> {
  return withTenantContext(
    companyId,
    (tx) => tx.$queryRaw<RecentActivity[]>`
      SELECT id, property_code, event_type, description, created_at
      FROM v_recent_activity WHERE company_id = ${companyId}
      ORDER BY created_at DESC LIMIT ${limit}
    `
  );
}

export async function getCondosPendingSetup(companyId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.condominium.findMany({
      where: { companyId, status: 'configuracion', deletedAt: null },
      select: { id: true, name: true },
    })
  );
}
