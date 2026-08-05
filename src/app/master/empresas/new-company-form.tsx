'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Plus, KeyRound, Copy, Check, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { createCompanyAction, type AltaState } from '../actions';

const VACIO: AltaState = {};

/**
 * Alta de cliente: empresa y su primer administrador en un paso.
 *
 * Al terminar muestra las credenciales UNA sola vez. No se guardan en
 * claro en ninguna parte, así que si se cierra la ventana sin copiarlas
 * hay que restablecer la contraseña — se avisa antes.
 */
export function NewCompanyForm() {
  const [abierto, setAbierto] = useState(false);
  const [state, formAction] = useFormState(createCompanyAction, VACIO);
  const router = useRouter();

  function cerrar() {
    setAbierto(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="btn-primary">
        <Plus size={16} /> Nueva empresa
      </button>

      {abierto && (
        <Modal
          title={state.credenciales ? 'Empresa creada' : 'Nueva empresa administradora'}
          onClose={cerrar}
        >
          {state.credenciales ? (
            <Credenciales
              email={state.credenciales.email}
              password={state.credenciales.password}
              onCerrar={cerrar}
            />
          ) : (
            <form action={formAction} className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Datos de la empresa</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo label="Razón social" error={state.errors?.legalName?.[0]}>
                    <input name="legalName" className="field-input w-full" placeholder="Administradora Delta S.A." />
                  </Campo>
                  <Campo label="Nombre comercial">
                    <input name="tradeName" className="field-input w-full" placeholder="Delta" />
                  </Campo>
                  <Campo label="Cédula jurídica">
                    <input name="taxId" className="field-input w-full" placeholder="3-101-000000" />
                  </Campo>
                  <Campo label="Teléfono">
                    <input name="phone" className="field-input w-full" />
                  </Campo>
                  <Campo label="Correo de la empresa" error={state.errors?.email?.[0]}>
                    <input name="email" type="email" className="field-input w-full" />
                  </Campo>
                </div>
              </div>

              <div className="rounded-xl bg-canvas p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                  Identidad visual (opcional)
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo label="Color principal">
                    <input name="brandPrimary" type="color" defaultValue="#3F6DF6" className="field-input h-10 w-full" />
                  </Campo>
                  <Campo label="Color de la barra lateral">
                    <input name="brandDeep" type="color" defaultValue="#0F172A" className="field-input h-10 w-full" />
                  </Campo>
                </div>
                <p className="mt-2 text-xs text-muted">
                  El panel de esta empresa se pinta con estos colores. Se pueden cambiar después.
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                  Primer administrador
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo label="Nombre completo" error={state.errors?.adminFullName?.[0]}>
                    <input name="adminFullName" className="field-input w-full" />
                  </Campo>
                  <Campo label="Correo de acceso" error={state.errors?.adminEmail?.[0]}>
                    <input name="adminEmail" type="email" className="field-input w-full" />
                  </Campo>
                </div>
                <Campo label="Contraseña (en blanco = se genera una)">
                  <input name="adminPassword" className="field-input w-full" placeholder="Se genera automáticamente" />
                </Campo>
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

export function Credenciales({
  email,
  password,
  onCerrar,
}: {
  email: string;
  password: string;
  onCerrar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const texto = `Usuario: ${email}\nContraseña: ${password}`;

  return (
    <div>
      <p className="flex items-start gap-2 rounded-xl bg-warn-bg/60 px-4 py-3 text-sm text-ink">
        <AlertTriangle size={16} className="mt-0.5 flex-none text-warn" />
        Copiá estas credenciales ahora. La contraseña no se guarda en claro: si cerrás esta ventana
        sin anotarla, habrá que restablecerla.
      </p>

      <div className="mt-4 rounded-xl border border-line bg-canvas p-4 font-mono text-sm">
        <p className="text-muted">Usuario</p>
        <p className="mb-3 select-all font-semibold text-ink">{email}</p>
        <p className="text-muted">Contraseña</p>
        <p className="flex items-center gap-2 select-all font-semibold text-ink">
          <KeyRound size={14} className="text-royal" /> {password}
        </p>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(texto).then(() => {
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2200);
            });
          }}
          className="btn-ghost"
        >
          {copiado ? <Check size={15} className="text-ok" /> : <Copy size={15} />}
          {copiado ? 'Copiado' : 'Copiar'}
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
      {pending ? 'Creando…' : 'Crear empresa y administrador'}
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
