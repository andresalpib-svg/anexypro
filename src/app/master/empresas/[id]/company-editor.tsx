'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { contrastaConBlanco } from '@/lib/branding';
import { updateCompanyAction, type ActionState } from '../../actions';

const VACIO: ActionState = {};

/**
 * Datos e identidad visual de la empresa.
 *
 * El aviso de contraste no es decorativo: si el color elegido no
 * contrasta con el blanco, los botones del panel de esa empresa quedan
 * ilegibles. Vale más advertirlo aquí que descubrirlo en producción.
 */
export function CompanyEditor({
  empresa,
}: {
  empresa: {
    id: string;
    legalName: string;
    tradeName: string | null;
    taxId: string | null;
    email: string | null;
    phone: string | null;
    brandPrimary: string | null;
    brandDeep: string | null;
    logoUrl: string | null;
    status: string;
  };
}) {
  const [state, formAction] = useFormState(updateCompanyAction, VACIO);
  const [primary, setPrimary] = useState(empresa.brandPrimary ?? '#3F6DF6');
  const [deep, setDeep] = useState(empresa.brandDeep ?? '#0F172A');

  const primaryLegible = contrastaConBlanco(primary);
  const deepLegible = contrastaConBlanco(deep);

  return (
    <section className="card p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink">Datos e identidad visual</h2>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="companyId" value={empresa.id} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Razón social">
            <input name="legalName" defaultValue={empresa.legalName} className="field-input w-full" />
          </Campo>
          <Campo label="Nombre comercial">
            <input name="tradeName" defaultValue={empresa.tradeName ?? ''} className="field-input w-full" />
          </Campo>
          <Campo label="Cédula jurídica">
            <input name="taxId" defaultValue={empresa.taxId ?? ''} className="field-input w-full" />
          </Campo>
          <Campo label="Teléfono">
            <input name="phone" defaultValue={empresa.phone ?? ''} className="field-input w-full" />
          </Campo>
          <Campo label="Correo">
            <input name="email" type="email" defaultValue={empresa.email ?? ''} className="field-input w-full" />
          </Campo>
          <Campo label="Estado">
            <select name="status" defaultValue={empresa.status} className="field-input w-full">
              <option value="activa">Activa</option>
              <option value="suspendida">Suspendida</option>
              <option value="inactiva">Inactiva</option>
            </select>
          </Campo>
        </div>

        <div className="rounded-xl bg-canvas p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Identidad visual</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Color principal">
              <input
                name="brandPrimary"
                type="color"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="field-input h-10 w-full"
              />
            </Campo>
            <Campo label="Color de la barra lateral">
              <input
                name="brandDeep"
                type="color"
                value={deep}
                onChange={(e) => setDeep(e.target.value)}
                className="field-input h-10 w-full"
              />
            </Campo>
          </div>

          {/* Vista previa: así se verán los botones de esa empresa. */}
          <div className="mt-3 flex items-center gap-2">
            <span
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: primary }}
            >
              Botón principal
            </span>
            <span
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: deep }}
            >
              Barra lateral
            </span>
          </div>

          {(!primaryLegible || !deepLegible) && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-warn-bg/60 px-3 py-2 text-xs text-ink">
              <AlertTriangle size={14} className="mt-0.5 flex-none text-warn" />
              {!primaryLegible && !deepLegible
                ? 'Los dos colores son demasiado claros: el texto blanco encima no se va a leer.'
                : !primaryLegible
                  ? 'El color principal es demasiado claro: el texto blanco de los botones no se va a leer bien.'
                  : 'El color de la barra lateral es demasiado claro para el texto blanco del menú.'}
            </p>
          )}

          <Campo label={empresa.logoUrl ? 'Reemplazar el logotipo' : 'Logotipo (opcional)'}>
            <input name="logo" type="file" accept="image/png,image/jpeg" className="field-input w-full" />
          </Campo>
          {empresa.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={empresa.logoUrl}
              alt="Logotipo actual"
              className="mt-2 h-12 rounded border border-line bg-white object-contain p-1"
            />
          )}
        </div>

        {state.formError && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{state.formError}</p>}
        {state.success && (
          <p className="flex items-center gap-2 rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">
            <CheckCircle2 size={15} /> Guardado. Sus usuarios lo verán al recargar.
          </p>
        )}

        <Guardar />
      </form>
    </section>
  );
}

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Guardando…' : 'Guardar cambios'}
    </button>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block first:mt-0">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}
