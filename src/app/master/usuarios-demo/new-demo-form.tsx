'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Plus, Link2, Copy, Check, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { crearUsuarioDemoAction, type CrearDemoState } from './actions';

const VACIO: CrearDemoState = {};

/**
 * "Crear usuario demo" — alta asistida para un prospecto puntual.
 *
 * No muestra ninguna contraseña: al terminar entrega un ENLACE para
 * que la persona elija la suya (vence en 30 min, un solo uso) — es el
 * "mecanismo seguro" pedido, y reutiliza el mismo que ya usa
 * "Restablecer contraseña" en el login.
 */
export function NewDemoUserForm() {
  const [abierto, setAbierto] = useState(false);
  const [state, formAction] = useFormState(crearUsuarioDemoAction, VACIO);
  const router = useRouter();

  function cerrar() {
    setAbierto(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="btn-primary">
        <Plus size={16} /> Crear usuario demo
      </button>

      {abierto && (
        <Modal title={state.resultado ? 'Demo creada' : 'Nueva cuenta demo'} onClose={cerrar}>
          {state.resultado ? (
            <Resultado resultado={state.resultado} onCerrar={cerrar} />
          ) : (
            <form action={formAction} className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Cliente / prospecto</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo label="Nombre del cliente o prospecto" error={state.errors?.clientName?.[0]}>
                    <input name="clientName" className="field-input w-full" placeholder="Condominio Los Robles" />
                  </Campo>
                  <Campo label="Teléfono">
                    <input name="phone" className="field-input w-full" placeholder="8888-8888" />
                  </Campo>
                  <Campo label="Correo electrónico" error={state.errors?.contactEmail?.[0]}>
                    <input name="contactEmail" type="email" className="field-input w-full" placeholder="contacto@ejemplo.com" />
                  </Campo>
                  <Campo label="Nombre del condominio" error={state.errors?.condoName?.[0]}>
                    <input name="condoName" className="field-input w-full" placeholder="Residencial Los Robles" />
                  </Campo>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Usuario inicial</p>
                <Campo label="Nombre completo" error={state.errors?.initialUserFullName?.[0]}>
                  <input name="initialUserFullName" className="field-input w-full" placeholder="María Fernández" />
                </Campo>
                <p className="mt-2 text-xs text-muted">
                  Entra con el correo de arriba, con acceso completo (administrador) — sin restricciones
                  adicionales. La contraseña la elige la propia persona con un enlace, nunca se genera una
                  para copiar.
                </p>
              </div>

              <div className="flex items-start gap-2 rounded-xl bg-canvas px-4 py-3 text-xs text-muted">
                <ShieldCheck size={15} className="mt-0.5 flex-none text-royal" />
                Dura 15 días. Vencido el plazo se bloquea sola (nunca borra datos); a los 18 días queda
                programada para una limpieza que todavía no está automatizada.
              </div>

              {state.formError && (
                <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{state.formError}</p>
              )}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={cerrar} className="btn-ghost">
                  Cancelar
                </button>
                <Guardar />
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

function Resultado({
  resultado,
  onCerrar,
}: {
  resultado: { email: string; setPasswordLink: string; expiresAt: string | Date };
  onCerrar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div>
      <p className="flex items-start gap-2 rounded-xl bg-warn-bg/60 px-4 py-3 text-sm text-ink">
        <AlertTriangle size={16} className="mt-0.5 flex-none text-warn" />
        Copiá este enlace y enviaselo al cliente ahora — no vuelve a mostrarse. Vence en 30 minutos y
        solo se puede usar una vez.
      </p>

      <div className="mt-4 rounded-xl border border-line bg-canvas p-4 font-mono text-sm">
        <p className="text-muted">Usuario</p>
        <p className="mb-3 select-all font-semibold text-ink">{resultado.email}</p>
        <p className="text-muted">Enlace para elegir contraseña</p>
        <p className="flex items-center gap-2 break-all select-all font-semibold text-ink">
          <Link2 size={14} className="flex-none text-royal" /> {resultado.setPasswordLink}
        </p>
      </div>

      <p className="mt-3 text-xs text-muted">
        Vence el {new Date(resultado.expiresAt).toLocaleDateString('es-CR', { dateStyle: 'long' })}.
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(resultado.setPasswordLink).then(() => {
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2200);
            });
          }}
          className="btn-ghost"
        >
          {copiado ? <Check size={15} className="text-ok" /> : <Copy size={15} />}
          {copiado ? 'Copiado' : 'Copiar enlace'}
        </button>
        <button type="button" onClick={onCerrar} className="btn-primary">
          Listo
        </button>
      </div>
    </div>
  );
}

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Creando…' : 'Crear cuenta demo'}
    </button>
  );
}

function Campo({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block first:mt-0">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}
