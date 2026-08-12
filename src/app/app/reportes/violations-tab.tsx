import Link from 'next/link';
import { getViolationReport, getViolationDashboard } from '@/lib/services/violation-followup';
import { StatusChip } from '@/components/ui/status-chip';

/**
 * Reporte de Gestión de Incumplimientos.
 *
 * Va por condominio, como el módulo. Los filtros viajan en la URL para
 * que un enlace filtrado se pueda compartir y para que la descarga en
 * Excel salga con el mismo alcance que se ve en pantalla.
 */
export async function ViolationsTab({
  companyId,
  condominiumId,
  filtros,
}: {
  companyId: string;
  condominiumId: string;
  filtros: { estado?: string; tipo?: string; desde?: string; hasta?: string; conMulta?: string; reincidencias?: string };
}) {
  // `openedAt` es un instante real (`DateTime`, no `@db.Date`) y quien
  // llena el filtro piensa en su día calendario de Costa Rica, no en
  // UTC. Sin offset explícito, `new Date(...)` se interpreta en la
  // hora del SERVIDOR — en Vercel (UTC) eso filtra por día UTC, que
  // recorta las últimas ~6 horas del día en hora de Costa Rica
  // (UTC−6): un incumplimiento reportado a las 7 p.m. CR ya cae en el
  // día UTC siguiente y desaparece del reporte de "hoy". Con `-06:00`
  // explícito, el rango cubre el día real en Costa Rica sin importar
  // en qué zona corra el servidor (mismo huso que ya usa este módulo
  // para mostrar fechas, ver `timeZone: 'America/Costa_Rica'` en
  // `violations.ts`/`violation-notice.ts`).
  const desde = filtros.desde ? new Date(`${filtros.desde}T00:00:00-06:00`) : undefined;
  const hasta = filtros.hasta ? new Date(`${filtros.hasta}T23:59:59-06:00`) : undefined;

  const [filas, panel] = await Promise.all([
    getViolationReport(companyId, {
      condominiumId,
      desde,
      hasta,
      status: filtros.estado || undefined,
      soloConMulta: filtros.conMulta === '1',
      soloReincidencias: filtros.reincidencias === '1',
    }),
    getViolationDashboard(companyId, condominiumId),
  ]);

  const fmt = (n: number) => n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="mt-5">
      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Incumplimientos del mes" valor={panel.mes} />
        <Kpi label="Casos abiertos" valor={panel.abiertos} />
        <Kpi label="Próximos a vencer" valor={panel.porVencer} destacado={panel.porVencer > 0} />
        <Kpi label="Multas aplicadas" valor={panel.multas} sub={panel.multasMonto > 0 ? fmt(panel.multasMonto) : undefined} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Tiempo promedio de resolución</p>
          <p className="mt-1 text-2xl font-extrabold text-ink">
            {panel.promedioResolucionDias == null ? '—' : `${panel.promedioResolucionDias} días`}
          </p>
          <p className="text-xs text-muted">
            {panel.promedioResolucionDias == null
              ? 'Todavía no hay expedientes cerrados con los que comparar.'
              : 'Desde que se abre el expediente hasta que se cierra.'}
          </p>
        </div>

        <ListaTop titulo="Filiales con más incumplimientos" filas={panel.topFiliales.map((f) => [f.code, f.total])} />
        <ListaTop titulo="Tipos más frecuentes" filas={panel.topTipos.map((t) => [t.name, t.total])} />
      </div>

      {/* Filtros */}
      <form method="get" className="card mt-4 flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="tab" value="incumplimientos" />
        <input type="hidden" name="condoId" value={condominiumId} />
        <Campo label="Desde">
          <input type="date" name="desde" defaultValue={filtros.desde ?? ''} className="field-input" />
        </Campo>
        <Campo label="Hasta">
          <input type="date" name="hasta" defaultValue={filtros.hasta ?? ''} className="field-input" />
        </Campo>
        <Campo label="Estado">
          <select name="estado" defaultValue={filtros.estado ?? ''} className="field-input">
            <option value="">Todos</option>
            <option value="abierto">Abiertos</option>
            <option value="cerrado">Cerrados</option>
          </select>
        </Campo>
        <label className="flex items-center gap-2 pb-2 text-sm text-ink">
          <input type="checkbox" name="conMulta" value="1" defaultChecked={filtros.conMulta === '1'} /> Solo con multa
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-ink">
          <input type="checkbox" name="reincidencias" value="1" defaultChecked={filtros.reincidencias === '1'} />{' '}
          Solo reincidencias
        </label>
        <button type="submit" className="btn-primary">
          Filtrar
        </button>
      </form>

      {/* Tabla */}
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Expediente</th>
              <th className="px-4 py-3">Filial</th>
              <th className="px-4 py-3">Propietario</th>
              <th className="px-4 py-3">Incumplimiento</th>
              <th className="px-4 py-3">Advertencias</th>
              <th className="px-4 py-3">Multa</th>
              <th className="px-4 py-3">Leídas</th>
              <th className="px-4 py-3">Apertura</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted">
                  Ningún expediente coincide con estos filtros.
                </td>
              </tr>
            ) : (
              filas.map((r) => (
                <tr key={r.caseNumber} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-semibold text-ink">{r.caseNumber}</td>
                  <td className="px-4 py-3 text-ink">{r.propertyCode}</td>
                  <td className="px-4 py-3 text-muted">{r.ownerName}</td>
                  <td className="px-4 py-3 text-ink">{r.typeName}</td>
                  <td className="px-4 py-3 text-muted">{r.warnings}</td>
                  <td className="px-4 py-3 text-muted">{r.fine ? fmt(r.fineAmount) : '—'}</td>
                  <td className="px-4 py-3 text-muted">
                    {r.readCount}/{r.actionCount}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.openedAt.toLocaleDateString('es-CR')}</td>
                  <td className="px-4 py-3">
                    <StatusChip variant={r.status === 'abierto' ? 'warn' : 'ok'}>
                      {r.status === 'abierto' ? 'Abierto' : 'Cerrado'}
                    </StatusChip>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted">
        {filas.length} expediente(s). La descarga en Excel usa el Condominio Activo.{' '}
        <Link href={`/app/incumplimientos?condoId=${condominiumId}`} className="font-semibold text-royal">
          Ir al módulo
        </Link>
      </p>
    </div>
  );
}

function Kpi({ label, valor, sub, destacado }: { label: string; valor: number; sub?: string; destacado?: boolean }) {
  return (
    <div className={`card p-4 ${destacado ? 'border-warn/50 bg-warn-bg/30' : ''}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-ink">{valor}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function ListaTop({ titulo, filas }: { titulo: string; filas: [string, number][] }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{titulo}</p>
      {filas.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Sin datos todavía.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {filas.map(([nombre, total]) => (
            <li key={nombre} className="flex justify-between">
              <span className="text-ink">{nombre}</span>
              <span className="font-semibold text-muted">{total}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}
