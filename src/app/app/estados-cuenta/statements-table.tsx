'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { StatusChip } from '@/components/ui/status-chip';

const TYPE_LABEL: Record<string, string> = {
  casa: 'Casa',
  apartamento: 'Apartamento',
  local: 'Local',
  lote: 'Lote',
  parqueo: 'Parqueo',
  bodega: 'Bodega',
};

export type StatementProperty = {
  id: string;
  code: string;
  propertyType: string;
  ownerName: string | null;
  balance: number;
  suspended: boolean;
  hasPaymentPlan: boolean;
  monthsOverdue: number;
};

/**
 * Filtro en el navegador, no en el servidor: la lista que llega ya
 * está acotada a UN condominio (el activo), así que buscar acá adentro
 * no puede filtrarse hacia otro. Mismo criterio que otras tablas del
 * panel que no paginan (Finanzas → Cuotas y pagos).
 */
export function StatementsTable({
  condominiumId,
  currency,
  properties,
}: {
  condominiumId: string;
  currency: string;
  properties: StatementProperty[];
}) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return properties;
    return properties.filter(
      (p) => p.code.toLowerCase().includes(needle) || (p.ownerName ?? '').toLowerCase().includes(needle)
    );
  }, [q, properties]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="card mt-4 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line p-4">
        <Search size={16} className="text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por unidad o propietario…"
          className="field-input w-full max-w-xs"
        />
        <span className="ml-auto text-xs text-muted">
          {filtered.length} de {properties.length} filiales
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Unidad</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Propietario</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  {properties.length === 0 ? 'Sin unidades activas en este condominio.' : 'Sin resultados para esa búsqueda.'}
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-canvas">
                  <td className="px-4 py-3 font-semibold text-ink">{p.code}</td>
                  <td className="px-4 py-3 text-muted">{TYPE_LABEL[p.propertyType] ?? p.propertyType}</td>
                  <td className="px-4 py-3 text-muted">{p.ownerName ?? '—'}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${p.balance > 0 ? 'text-danger' : 'text-ok'}`}>
                    {fmt(p.balance)}
                  </td>
                  <td className="px-4 py-3">
                    {p.suspended ? (
                      <StatusChip variant="danger">Suspendida ({p.monthsOverdue}m)</StatusChip>
                    ) : p.hasPaymentPlan && p.balance > 0 ? (
                      <StatusChip variant="royal">Convenio vigente</StatusChip>
                    ) : p.balance > 0 ? (
                      <StatusChip variant="warn">Saldo pendiente</StatusChip>
                    ) : (
                      <StatusChip variant="ok">Al día</StatusChip>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/app/estados-cuenta/${p.id}?condoId=${condominiumId}`}
                      className="btn-ghost py-1.5 text-xs"
                    >
                      Ver estado de cuenta
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
