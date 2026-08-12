'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Trash2, XCircle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { enTransicion } from '@/lib/accion-segura';
import { purgarDemoAction } from './actions';
import type { PurgeDemoResult } from '@/lib/services/demo-cleanup';

/**
 * "Purgar archivos" (PASO 9) — borrado FÍSICO e irreversible de los
 * archivos de Drive de una demo. Solo aparece cuando la página decide
 * mostrarlo (VALIDACIÓN EN FRONTEND: DEMO_VENCIDO ya pasado el día 18,
 * o DEMO_CLEANUP_FAILED para reintentar) — la de verdad, la que no se
 * puede saltar cambiando el DOM a mano, es la del servidor
 * (`purgarDemoAction` → `guardMaster()` + `purgeDemoDriveFiles`, que
 * revalida todo por su cuenta: estado, fecha, exclusividad de cada
 * archivo).
 *
 * Sin disparador automático todavía: cada corrida la inicia un master,
 * a mano, desde este botón.
 */
export function PurgarDemoButton({ companyId, clientName, retry }: { companyId: string; clientName: string; retry: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<PurgeDemoResult | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  function cerrar() {
    setAbierto(false);
    setResultado(null);
    setError(null);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-danger/30 bg-danger-bg py-1.5 text-xs font-semibold text-danger transition hover:bg-danger-bg/70"
      >
        <Trash2 size={13} /> {retry ? 'Reintentar limpieza' : 'Purgar archivos de Drive'}
      </button>

      {abierto && (
        <Modal title={resultado ? 'Resultado de la limpieza' : `Purgar archivos de "${clientName}"`} onClose={cerrar}>
          {resultado ? (
            <div>
              {resultado.status === 'ok' ? (
                <p className="flex items-start gap-2 rounded-xl bg-ok-bg/60 px-4 py-3 text-sm text-ink">
                  <CheckCircle2 size={16} className="mt-0.5 flex-none text-ok" />
                  {resultado.summary}
                </p>
              ) : resultado.status === 'omitido' ? (
                <p className="flex items-start gap-2 rounded-xl bg-canvas px-4 py-3 text-sm text-ink">
                  <CheckCircle2 size={16} className="mt-0.5 flex-none text-muted" />
                  {resultado.summary}
                </p>
              ) : (
                <p className="flex items-start gap-2 rounded-xl bg-danger-bg px-4 py-3 text-sm text-ink">
                  <XCircle size={16} className="mt-0.5 flex-none text-danger" />
                  {resultado.summary}
                </p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-line bg-canvas p-3">
                  <p className="text-muted">Archivos</p>
                  <p className="font-semibold text-ink">
                    {resultado.filesDeleted} de {resultado.filesFound}
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-canvas p-3">
                  <p className="text-muted">Carpetas</p>
                  <p className="font-semibold text-ink">
                    {resultado.foldersDeleted} de {resultado.foldersFound}
                  </p>
                </div>
              </div>

              {resultado.failed.length > 0 && (
                <div className="mt-4 rounded-xl border border-danger/30 bg-danger-bg/40 p-3">
                  <p className="mb-1.5 text-xs font-semibold text-danger">Quedaron {resultado.failed.length} elemento(s) sin borrar:</p>
                  <ul className="space-y-1 text-xs text-ink">
                    {resultado.failed.map((f) => (
                      <li key={f.id}>
                        [{f.kind}] {f.name} — {f.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <button type="button" onClick={cerrar} className="btn-primary">
                  Listo
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="flex items-start gap-2 rounded-xl bg-danger-bg px-4 py-3 text-sm text-ink">
                <AlertTriangle size={16} className="mt-0.5 flex-none text-danger" />
                Esto borra FÍSICA e IRREVERSIBLEMENTE los archivos de Drive de esta demo — no van a la papelera,
                no se pueden recuperar. Antes de tocar nada se vuelve a comprobar, archivo por archivo, que sea
                exclusivo de esta cuenta; si algo no se puede confirmar con seguridad, se detiene sin borrarlo.
              </p>

              {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={cerrar} className="btn-ghost">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() =>
                    enTransicion(iniciar, async () => {
                      const r = await purgarDemoAction(companyId);
                      if (!r.ok) setError(r.error);
                      else setResultado(r.resultado);
                    })
                  }
                  className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {pendiente ? 'Purgando…' : 'Sí, purgar archivos ahora'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
