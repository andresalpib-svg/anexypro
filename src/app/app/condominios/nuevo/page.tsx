'use client';

import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createCondominiumAction, type CreateCondoState } from '../actions';
import { PageHeader } from '@/components/ui/page-header';

const initialState: CreateCondoState = {};

export default function NuevoCondominioPage() {
  const [state, formAction] = useFormState(createCondominiumAction, initialState);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Nuevo condominio"
        subtitle="Nace en configuración — se activa cuando termines de completar sus datos y empiece a facturar."
        action={
          <Link href="/app/condominios" className="btn-ghost">
            <ArrowLeft size={16} /> Volver
          </Link>
        }
      />

      <form action={formAction} className="card space-y-5 p-6">
        {state.formError && (
          <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
            {state.formError}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre" name="name" placeholder="Vistas del Robledal" errors={state.errors?.name} full />
          <Field label="Código" name="code" placeholder="VDR" errors={state.errors?.code} />
          <div>
            <label className="field-label" htmlFor="type">
              Tipo
            </label>
            <select id="type" name="type" defaultValue="residencial" className="field-input">
              <option value="residencial">Residencial</option>
              <option value="vertical">Vertical</option>
              <option value="mixto">Mixto</option>
              <option value="comercial">Comercial</option>
            </select>
          </div>
        </div>

        <Field label="Dirección" name="addressLine" placeholder="Guácimo, Alajuela" errors={state.errors?.addressLine} full />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Provincia" name="province" errors={state.errors?.province} />
          <Field label="Cantón" name="canton" errors={state.errors?.canton} />
          <Field label="Distrito" name="district" errors={state.errors?.district} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="currency">
              Moneda
            </label>
            <select id="currency" name="currency" defaultValue="CRC" className="field-input">
              <option value="CRC">Colones (CRC)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          </div>
          <Field label="Cuota ordinaria mensual" name="baseFee" type="number" step="0.01" defaultValue="0" errors={state.errors?.baseFee} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Día de vencimiento" name="dueDay" type="number" defaultValue="15" errors={state.errors?.dueDay} />
          <Field
            label="Meses de atraso para suspender servicios"
            name="suspensionMonths"
            type="number"
            defaultValue="3"
            errors={state.errors?.suspensionMonths}
          />
        </div>

        <div className="rounded-lg bg-canvas p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Unidades del condominio</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Cantidad de casas/unidades a crear de inmediato"
              name="unitsCount"
              type="number"
              min={0}
              placeholder="Ej: 48"
              errors={state.errors?.unitsCount}
            />
            <div>
              <label className="field-label" htmlFor="unitsType">
                Tipo de unidad
              </label>
              <select id="unitsType" name="unitsType" defaultValue="casa" className="field-input">
                <option value="casa">Casas</option>
                <option value="apartamento">Apartamentos</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="field-label" htmlFor="excelFile">
              O adjunta la base de datos en Excel (unidades y residentes)
            </label>
            <input id="excelFile" name="excelFile" type="file" accept=".xlsx,.xls" className="field-input" />
            <p className="mt-1 text-xs text-muted">
              Formato: Filial · Nombre · Apellidos · Cédula · Correo · Teléfono · Placa y marca · Habitantes · Visitas recurrentes.{' '}
              <a href="/app/propiedades/plantilla" className="font-semibold text-royal hover:underline">
                Descargar plantilla
              </a>
            </p>
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="notes">
            Notas internas (opcional)
          </label>
          <textarea id="notes" name="notes" rows={3} className="field-input" />
        </div>

        <SubmitButton />
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  errors,
  full,
  ...rest
}: {
  label: string;
  name: string;
  errors?: string[];
  full?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="field-label" htmlFor={name}>
        {label}
      </label>
      <input id={name} name={name} className="field-input" {...rest} />
      {errors?.map((e) => (
        <p key={e} className="mt-1 text-xs font-medium text-danger">
          {e}
        </p>
      ))}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? 'Creando…' : 'Crear condominio'}
    </button>
  );
}
