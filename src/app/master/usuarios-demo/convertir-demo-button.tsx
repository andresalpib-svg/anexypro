'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { enTransicion } from '@/lib/accion-segura';
import { hoyISO } from '@/lib/fecha-local';
import { convertirDemoAction } from './actions';
import type { ConvertirDemoResultado } from '@/lib/services/demo';

type PlanSimple = { id: string; name: string; price: number; currency: string; period: string };

const money = (n: number, c: string) =>
  `${c} ${n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * "Convertir a cuenta formal" — solo aparece para `DEMO_ACTIVO` y
 * `DEMO_VENCIDO` (lo decide la página, que no dibuja este componente
 * para el resto de los estados: VALIDACIÓN EN FRONTEND). La de verdad
 * es la del servidor: `convertirDemoAction` → `guardMaster()` +
 * `convertDemoToFormal`.
 *
 * El condominio, los residentes, los usuarios, los documentos y todo
 * lo demás NO se tocan acá — siguen en la misma empresa. Este
 * formulario solo pide lo que hace falta para que deje de ser una
 * demo: el plan que contrata y desde cuándo.
 */
export function ConvertirDemoButton({ companyId, clientName, planes }: { companyId: string; clientName: string; planes: PlanSimple[] }) {
  const [abierto, setAbierto] = useState(false);
  const [planId, setPlanId] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ConvertirDemoResultado | null>(null);
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
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-ok/30 bg-ok/5 py-1.5 text-xs font-semibold text-ok transition hover:bg-ok/10"
      >
        <Sparkles size={13} /> Convertir a cuenta formal
      </button>

      {abierto && (
        <Modal title={resultado ? 'Convertida a cuenta formal' : `Convertir "${clientName}"`} onClose={cerrar}>
          {resultado ? (
            <div>
              <p className="flex items-start gap-2 rounded-xl bg-ok-bg/60 px-4 py-3 text-sm text-ink">
                <CheckCircle2 size={16} className="mt-0.5 flex-none text-ok" />
                El condominio, los residentes, los usuarios, los documentos y todo lo cargado durante la
                demo siguen exactamente igual — solo dejó de tratarse como demo.
              </p>
              <div className="mt-4 rounded-xl border border-line bg-canvas p-4 text-sm">
                <p className="text-muted">Plan contratado</p>
                <p className="mb-3 font-semibold text-ink">{resultado.planName}</p>
                <p className="text-muted">Próximo pago</p>
                <p className="mb-3 font-semibold text-ink">
                  {new Date(resultado.nextPaymentDate).toLocaleDateString('es-CR', { dateStyle: 'long' })}
                </p>
                <p className="text-muted">Estado final</p>
                <p className={resultado.carpetaDriveConservada ? 'mb-3 font-semibold text-ink' : 'font-semibold text-ink'}>
                  {resultado.estadoFinal}
                </p>
                {resultado.carpetaDriveConservada && (
                  <>
                    <p className="text-muted">Carpeta de Drive conservada</p>
                    <p className="font-semibold text-ink">{resultado.carpetaDriveConservada.name}</p>
                  </>
                )}
              </div>
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={cerrar} className="btn-primary">
                  Listo
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                El condominio, los residentes, los documentos, las imágenes y todo lo demás se conservan
                tal cual — no se crea una empresa nueva. Solo hace falta el plan que contrata.
              </p>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">Plan contratado</span>
                <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="field-input w-full">
                  <option value="">Elegí un plan…</option>
                  {planes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {money(p.price, p.currency)} {p.period}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">Próxima fecha de pago</span>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="field-input w-full" />
              </label>

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
                      const r = await convertirDemoAction(companyId, planId, fecha);
                      if (!r.ok) setError(r.error);
                      else setResultado(r.resultado);
                    })
                  }
                  className="btn-primary"
                >
                  {pendiente ? 'Convirtiendo…' : 'Convertir a cuenta formal'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
