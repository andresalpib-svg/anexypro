import { History } from 'lucide-react';

export type ChangeRow = {
  id: string;
  createdAt: string;
  userName: string;
  entity: string;
  entityId: string | null;
  /** Desde dónde se hizo. Nulo si lo hizo un proceso automático. */
  ip: string | null;
  action: string;
  changes: Record<string, unknown> | null;
};

type Cambio = { campo: string; antes: unknown; despues: unknown };

/** `null`/`undefined` se lee mejor como una raya que como la palabra "null". */
function valor(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'number') return v.toLocaleString('es-CR');
  return String(v);
}

export function ChangesTable({ rows }: { rows: ChangeRow[] }) {
  return (
    <div className="card mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3">Cuándo</th>
            <th className="px-4 py-3">Usuario</th>
            <th className="px-4 py-3">Registro</th>
            <th className="px-4 py-3">Acción</th>
            <th className="px-4 py-3">Qué cambió</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-muted">
                <History className="mx-auto mb-2 text-muted" size={22} />
                Todavía no hay cambios registrados. Acá aparecen las operaciones sensibles —anulaciones,
                presupuesto y permisos— con el valor anterior y el nuevo.
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const cambios = (r.changes?.cambios as Cambio[] | undefined) ?? [];
              const snapshot = r.changes?.snapshot as Record<string, unknown> | undefined;
              const motivo = r.changes?.motivo as string | undefined;
              return (
                <tr key={r.id} className="border-b border-line align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">
                    {new Date(r.createdAt).toLocaleString('es-CR')}
                  </td>
                  <td className="px-4 py-2.5 text-ink">
                    {r.userName}
                    {r.ip && <span className="block text-[.7rem] text-muted">desde {r.ip}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{r.entity}</td>
                  <td className="px-4 py-2.5 text-ink">{r.action}</td>
                  <td className="px-4 py-2.5">
                    {cambios.length > 0 && (
                      <ul className="space-y-0.5">
                        {cambios.map((c, i) => (
                          <li key={i} className="text-xs">
                            <span className="font-medium text-ink">{c.campo}:</span>{' '}
                            <span className="text-muted line-through">{valor(c.antes)}</span>
                            <span className="mx-1 text-muted">→</span>
                            <span className="font-semibold text-ink">{valor(c.despues)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {snapshot && (
                      <p className="mt-1 text-xs text-muted">
                        {Object.entries(snapshot)
                          .map(([k, v]) => `${k}: ${valor(v)}`)
                          .join(' · ')}
                      </p>
                    )}
                    {motivo && <p className="mt-1 text-xs italic text-muted">Motivo: {motivo}</p>}
                    {cambios.length === 0 && !snapshot && !motivo && <span className="text-xs text-muted">—</span>}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
