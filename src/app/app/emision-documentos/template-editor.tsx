'use client';

import { useState, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Palette, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { saveTemplateAction, type ActionState } from './actions';

export type TemplateData = {
  docType: string;
  logoUrl: string | null;
  primaryColor: string;
  headerText: string | null;
  footerText: string | null;
  adminName: string | null;
  adminDetails: string | null;
  bodyTemplate: string | null;
  signerName: string | null;
  signerTitle: string | null;
  signatureUrl: string | null;
  requiresCurrentAccount: boolean;
};

const DOC_LABEL: Record<string, string> = {
  certificacion_cuotas_al_dia: 'Certificación de cuotas al día',
  estado_cuenta: 'Estado de cuenta',
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">
      {pending ? 'Guardando…' : 'Guardar configuración'}
    </button>
  );
}

export function TemplateEditor({ condominiumId, template }: { condominiumId: string; template: TemplateData }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(saveTemplateAction, {});
  const [color, setColor] = useState(template.primaryColor);

  useEffect(() => {
    if (state.success) toast.success('Configuración del documento guardada.');
  }, [state.success]);

  return (
    <div className="card p-5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <Palette size={15} className="flex-none" style={{ color }} />
        <span className="flex-1">
          <span className="block text-sm font-bold text-ink">{DOC_LABEL[template.docType] ?? template.docType}</span>
          <span className="block text-xs text-muted">Diseño, encabezado, pie y cuerpo del documento</span>
        </span>
        {open ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
      </button>

      {open && (
        <form action={formAction} className="mt-4 space-y-3">
          <input type="hidden" name="condominiumId" value={condominiumId} />
          <input type="hidden" name="docType" value={template.docType} />

          <p className="rounded-lg bg-canvas px-3 py-2 text-[.7rem] leading-relaxed text-muted">
            La <b>fecha de emisión</b>, el <b>nombre del condominio</b>, el <b>nombre del propietario</b> y el{' '}
            <b>número de filial</b> se completan automáticamente con los datos del solicitante — no se configuran aquí.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Logo del condominio</label>
              <input name="logo" type="file" accept=".jpg,.jpeg,.png,.webp" className="field-input text-xs" />
              {template.logoUrl && (
                <div className="mt-1.5 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={template.logoUrl} alt="Logo actual" className="h-8 w-8 object-contain" />
                  <span className="text-[.7rem] text-muted">Logo actual</span>
                </div>
              )}
            </div>
            <div>
              <label className="field-label">Color del documento</label>
              <div className="flex items-center gap-2">
                <input
                  name="primaryColor"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded-lg border border-line"
                />
                <span className="font-mono text-xs text-muted">{color}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="field-label">Encabezado</label>
            <input name="headerText" defaultValue={template.headerText ?? ''} className="field-input" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Administradora asignada</label>
              <input name="adminName" defaultValue={template.adminName ?? ''} className="field-input" />
            </div>
            <div>
              <label className="field-label">Datos de la administradora</label>
              <input
                name="adminDetails"
                defaultValue={template.adminDetails ?? ''}
                placeholder="Cédula jurídica · teléfono · correo"
                className="field-input"
              />
            </div>
          </div>

          <div>
            <label className="field-label">Cuerpo del documento</label>
            <textarea name="bodyTemplate" defaultValue={template.bodyTemplate ?? ''} rows={5} className="field-input text-sm" />
            <p className="mt-1 text-[.7rem] text-muted">
              Se usa como texto por defecto; al aprobar cada solicitud aún puedes editarlo.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Firma — nombre</label>
              <input name="signerName" defaultValue={template.signerName ?? ''} className="field-input" />
            </div>
            <div>
              <label className="field-label">Firma — cargo</label>
              <input name="signerTitle" defaultValue={template.signerTitle ?? ''} className="field-input" />
            </div>
          </div>

          <div>
            <label className="field-label">
              Firma — imagen {template.signatureUrl ? '(reemplazar)' : '(opcional)'}
            </label>
            <input name="signature" type="file" accept="image/png,image/jpeg" className="field-input" />
            <p className="mt-1 text-[.7rem] text-muted">
              Se imprime sobre la línea de firma del documento. Conviene una imagen con fondo
              transparente o blanco.
            </p>
            {template.signatureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={template.signatureUrl}
                alt="Firma actual"
                className="mt-2 h-14 rounded border border-line bg-white object-contain p-1"
              />
            )}
          </div>

          <div>
            <label className="field-label">Pie de página</label>
            <input name="footerText" defaultValue={template.footerText ?? ''} className="field-input" />
          </div>

          <label className="flex items-start gap-2 rounded-lg bg-canvas px-3 py-2.5 text-xs text-ink">
            <input
              type="checkbox"
              name="requiresCurrentAccount"
              defaultChecked={template.requiresCurrentAccount}
              className="mt-0.5"
            />
            <span>
              <b>Exigir que la filial esté al día</b> para poder solicitar y emitir este documento.
              <span className="block text-muted">
                Obligatorio en la certificación de cuotas al día. En el estado de cuenta suele dejarse desmarcado, para
                que el documento pueda emitirse indicando el atraso.
              </span>
            </span>
          </label>

          <SaveButton />
          {state.formError && <p className="text-xs font-medium text-danger">{state.formError}</p>}
        </form>
      )}
    </div>
  );
}
