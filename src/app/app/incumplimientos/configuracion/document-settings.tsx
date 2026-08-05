'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { CheckCircle2 } from 'lucide-react';
import { saveSettingsAction, type ActionState } from '../actions';

const VACIO: ActionState = {};

/**
 * Membrete y firma del documento. Es del condominio, no del tipo de
 * incumplimiento: la notificación por ruido y la de parqueo salen con
 * el mismo encabezado y la misma firma.
 */
export function DocumentSettings({
  condominiumId,
  settings,
}: {
  condominiumId: string;
  settings: {
    primaryColor: string;
    headerText: string | null;
    footerText: string | null;
    adminName: string | null;
    adminDetails: string | null;
    signerName: string | null;
    signerTitle: string | null;
    responseDays: number;
    logoUrl: string | null;
  } | null;
}) {
  const [state, formAction] = useFormState(saveSettingsAction, VACIO);

  return (
    <section className="card p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink">Formato del documento</h2>
      <p className="mt-0.5 text-xs text-muted">
        Encabezado, firma y colores del PDF que recibe el propietario.
      </p>

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="condominiumId" value={condominiumId} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Administración a cargo">
            <input name="adminName" defaultValue={settings?.adminName ?? ''} className="field-input w-full" />
          </Campo>
          <Campo label="Datos de la administradora (cédula, teléfono)">
            <input name="adminDetails" defaultValue={settings?.adminDetails ?? ''} className="field-input w-full" />
          </Campo>
        </div>

        <Campo label="Encabezado del documento">
          <input
            name="headerText"
            defaultValue={settings?.headerText ?? ''}
            placeholder="Cédula jurídica 3-101-000000 · San José, Costa Rica"
            className="field-input w-full"
          />
        </Campo>

        <Campo label="Pie de página">
          <input
            name="footerText"
            defaultValue={settings?.footerText ?? ''}
            placeholder="Documento emitido electrónicamente."
            className="field-input w-full"
          />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Firma: nombre">
            <input name="signerName" defaultValue={settings?.signerName ?? ''} className="field-input w-full" />
          </Campo>
          <Campo label="Firma: cargo">
            <input name="signerTitle" defaultValue={settings?.signerTitle ?? ''} className="field-input w-full" />
          </Campo>
          <Campo label="Días de plazo para atender">
            <input
              name="responseDays"
              type="number"
              min={1}
              max={90}
              defaultValue={settings?.responseDays ?? 8}
              className="field-input w-full"
            />
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Color de la marca">
            <input
              name="primaryColor"
              type="color"
              defaultValue={settings?.primaryColor ?? '#3B6EF5'}
              className="field-input h-10 w-full"
            />
          </Campo>
          <Campo label={settings?.logoUrl ? 'Reemplazar el logotipo' : 'Logotipo (opcional)'}>
            <input name="logo" type="file" accept="image/png,image/jpeg" className="field-input w-full" />
          </Campo>
        </div>

        {state.formError && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{state.formError}</p>}
        {state.success && (
          <p className="flex items-center gap-2 rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">
            <CheckCircle2 size={15} /> Configuración guardada.
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
      {pending ? 'Guardando…' : 'Guardar formato'}
    </button>
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
