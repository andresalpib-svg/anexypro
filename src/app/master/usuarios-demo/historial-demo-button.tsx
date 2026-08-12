'use client';

import { useState, useTransition } from 'react';
import { History, Save } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { ejecutar, enTransicion } from '@/lib/accion-segura';
import { obtenerHistorialDemoAction, guardarNotasComercialesAction } from './actions';
import type { DemoSummary, DemoHistoryRow } from '@/lib/services/demo';

/**
 * "Ver historial" (PASO 11) — la ficha comercial permanente de una
 * demo, disponible sin importar su estado: activa, vencida, convertida
 * o ya eliminada. A propósito NO muestra archivos ni datos operativos
 * (residentes, cargos…) — solo los 15 campos comerciales y la línea de
 * tiempo de eventos de `DemoHistoryEntry`.
 */

const EVENT_LABEL: Record<string, string> = {
  creada: 'Demo creada',
  creación_fallida: 'Creación fallida',
  vencida: 'Demo vencida',
  reactivada: 'Demo reactivada',
  convertida_formal: 'Convertida a cuenta formal',
  limpieza_iniciada: 'Limpieza de archivos iniciada',
  archivos_eliminados: 'Archivos eliminados físicamente',
  eliminada: 'Limpieza completada',
  limpieza_fallida: 'Limpieza fallida',
  purga_omitida: 'Purga omitida (ya estaba eliminada)',
};

function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="text-sm text-ink">{value ?? '—'}</p>
    </div>
  );
}

const fecha = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString('es-CR', { dateStyle: 'medium' }) : null);
const fechaHora = (d: Date | string) => new Date(d).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });

export function HistorialDemoButton({ companyId, clientName }: { companyId: string; clientName: string }) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<DemoSummary | null>(null);
  const [historial, setHistorial] = useState<DemoHistoryRow[]>([]);
  const [notas, setNotas] = useState('');
  const [pendiente, iniciar] = useTransition();
  const [guardandoNotas, iniciarGuardado] = useTransition();

  async function abrir() {
    setAbierto(true);
    setCargando(true);
    setError(null);
    const r = await ejecutar(() => obtenerHistorialDemoAction(companyId));
    setCargando(false);
    if (!r) return;
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setResumen(r.resumen);
    setHistorial(r.historial);
    setNotas(r.resumen.demoCommercialNotes ?? '');
  }

  function cerrar() {
    setAbierto(false);
    setResumen(null);
    setHistorial([]);
    setError(null);
  }

  function guardarNotas() {
    enTransicion(iniciarGuardado, async () => {
      const r = await ejecutar(() => guardarNotasComercialesAction(companyId, notas));
      if (r?.ok && resumen) setResumen({ ...resumen, demoCommercialNotes: notas.trim() || null });
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={pendiente}
        onClick={() => enTransicion(iniciar, abrir)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-canvas py-1.5 text-xs font-semibold text-ink transition hover:bg-line/40 disabled:opacity-50"
      >
        <History size={13} /> Ver historial
      </button>

      {abierto && (
        <Modal title={`Historial comercial — ${clientName}`} onClose={cerrar} width="max-w-2xl">
          {cargando && <p className="py-8 text-center text-sm text-muted">Cargando…</p>}
          {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

          {resumen && (
            <div className="space-y-5">
              <section className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <Campo label="Cliente/prospecto" value={resumen.tradeName ?? resumen.legalName} />
                <Campo label="Correo" value={resumen.email} />
                <Campo label="Teléfono" value={resumen.phone} />
                <Campo label="Condominio" value={resumen.condominiumName} />
                <Campo label="Estado final" value={resumen.demoStatus ?? '—'} />
                <Campo label="Creada por" value={resumen.demoCreatedByName ?? 'Autoservicio (/demo)'} />
                <Campo label="Fecha de creación" value={fecha(resumen.createdAt)} />
                <Campo label="Fecha de inicio" value={fecha(resumen.demoStartedAt)} />
                <Campo label="Fecha de vencimiento" value={fecha(resumen.demoExpiresAt)} />
                <Campo label="Fecha de eliminación" value={fecha(resumen.demoDeletedAt)} />
                <Campo label="¿Convertida?" value={resumen.wasConverted ? 'Sí' : 'No'} />
                {resumen.wasConverted && (
                  <>
                    <Campo label="Fecha de conversión" value={fecha(resumen.demoConvertedAt)} />
                    <Campo label="Convertida por" value={resumen.demoConvertedByName} />
                    <Campo label="Plan adquirido" value={resumen.demoConvertedPlanName} />
                  </>
                )}
              </section>

              <section>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                  Observaciones comerciales
                </label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder="Notas de venta o seguimiento — nunca archivos ni datos del condominio."
                  className="field-input w-full resize-y"
                />
                <div className="mt-1.5 flex justify-end">
                  <button
                    type="button"
                    disabled={guardandoNotas}
                    onClick={guardarNotas}
                    className="flex items-center gap-1.5 rounded-lg border border-royal/30 bg-royal/5 px-3 py-1 text-xs font-semibold text-royal transition hover:bg-royal/10 disabled:opacity-50"
                  >
                    <Save size={12} /> {guardandoNotas ? 'Guardando…' : 'Guardar notas'}
                  </button>
                </div>
              </section>

              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Línea de tiempo</p>
                {historial.length === 0 ? (
                  <p className="text-sm text-muted">Sin eventos registrados.</p>
                ) : (
                  <ul className="max-h-64 space-y-2 overflow-y-auto border-l-2 border-line pl-3">
                    {historial.map((h) => (
                      <li key={h.id}>
                        <p className="text-xs font-semibold text-ink">
                          {EVENT_LABEL[h.event] ?? h.event}{' '}
                          <span className="font-normal text-muted">· {fechaHora(h.occurredAt)}</span>
                        </p>
                        {h.detail && <p className="text-xs text-muted">{h.detail}</p>}
                        <p className="text-[11px] text-muted">{h.actorName ?? 'Sistema (proceso automático)'}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="flex justify-end">
                <button type="button" onClick={cerrar} className="btn-primary">
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
