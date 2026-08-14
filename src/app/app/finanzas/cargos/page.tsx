'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { addChargeAction, type ActionState } from '../actions';
import { StatusChip } from '@/components/ui/status-chip';

const CARGO_TYPES = [
  { value: 'cuota_extraordinaria', label: 'Cuota Extraordinaria', description: 'Derrama por decisión de asamblea' },
  { value: 'interes_moratorio', label: 'Interés Moratorio', description: 'Interés por mora en cuota' },
  { value: 'multa', label: 'Multa', description: 'Sanción por incumplimiento' },
  { value: 'reposicion_danos', label: 'Reposición de Daños', description: 'Reparación de daños causados' },
  { value: 'mantenimiento_parqueo', label: 'Mantenimiento Parqueo', description: 'Servicio especial de parqueo' },
  { value: 'reserva_area_social', label: 'Reserva Área Social', description: 'Tarifa por reserva de área' },
  { value: 'otro', label: 'Otro', description: 'Otro tipo de cargo' },
];

export default function CargosPage({
  params: { condominiumId },
}: {
  params: { condominiumId?: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const condoId = condominiumId || searchParams.get('condoId') || '';
  const propId = searchParams.get('propId') || '';

  const [properties, setProperties] = useState<any[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<any | null>(null);
  const [selectedChargeType, setSelectedChargeType] = useState('cuota_extraordinaria');
  const [state, formAction] = useFormState<ActionState, FormData>(addChargeAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Cargar propiedades del condominio
  useEffect(() => {
    if (!condoId) return;
    const loadProperties = async () => {
      try {
        const response = await fetch(`/api/finanzas/properties?condoId=${condoId}`);
        if (response.ok) {
          const data = await response.json();
          setProperties(data);
          if (propId) {
            const prop = data.find((p: any) => p.id === propId);
            if (prop) setSelectedProperty(prop);
          }
        }
      } catch (err) {
        console.error('Error cargando propiedades:', err);
      }
    };
    loadProperties();
  }, [condoId, propId]);

  // Limpiar formulario si fue exitoso
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setSelectedProperty(null);
      setSelectedChargeType('cuota_extraordinaria');
      // Recargar propiedades para actualizar saldos
      if (condoId) {
        const timer = setTimeout(() => {
          window.location.reload();
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [state.success, condoId]);

  const chargeTypeInfo = CARGO_TYPES.find((ct) => ct.value === selectedChargeType);

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n);

  // Calcular fecha mínima (hoy) y sugerencia de fecha de vencimiento
  const today = new Date();
  const minDate = today.toISOString().split('T')[0];
  const suggestedDueDate = new Date(today);
  suggestedDueDate.setDate(suggestedDueDate.getDate() + 15); // 15 días de plazo
  const suggestedDueDateStr = suggestedDueDate.toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Registrar Cargo</h1>
        <p className="text-sm text-muted mt-1">
          Crea cuotas extraordinarias, multas, intereses y otros cargos
        </p>
      </div>

      <form ref={formRef} action={formAction} className="space-y-6 max-w-2xl">
        <input type="hidden" name="condominiumId" value={condoId} />
        <input type="hidden" name="propertyId" value={selectedProperty?.id || ''} />

        {/* Selector de filial */}
        <div>
          <label className="field-label">Filial / Propiedad *</label>
          <select
            value={selectedProperty?.id || ''}
            onChange={(e) => {
              const prop = properties.find((p) => p.id === e.target.value);
              setSelectedProperty(prop || null);
            }}
            className="field-input w-full"
            required
          >
            <option value="">— Selecciona una filial —</option>
            {properties.map((prop) => (
              <option key={prop.id} value={prop.id}>
                {prop.code} — {prop.ownerName || 'Sin propietario'}
              </option>
            ))}
          </select>
        </div>

        {/* Detalles de la filial */}
        {selectedProperty && (
          <div className="grid grid-cols-2 gap-4 p-4 bg-canvas rounded-lg border border-line">
            <div>
              <p className="text-xs text-muted">Código</p>
              <p className="font-semibold text-ink">{selectedProperty.code}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Propietario</p>
              <p className="font-semibold text-ink">{selectedProperty.ownerName || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Saldo Actual</p>
              <p
                className={`font-bold text-lg ${selectedProperty.balance > 0 ? 'text-danger' : 'text-ok'}`}
              >
                {fmt(selectedProperty.balance)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Estado</p>
              <div className="mt-1">
                {selectedProperty.suspended ? (
                  <StatusChip variant="danger">Suspendida</StatusChip>
                ) : selectedProperty.balance > 0 ? (
                  <StatusChip variant="warn">En mora</StatusChip>
                ) : (
                  <StatusChip variant="ok">Al día</StatusChip>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tipo de Cargo */}
        <div>
          <label className="field-label">Tipo de Cargo *</label>
          <div className="space-y-2">
            {CARGO_TYPES.map((type) => (
              <label key={type.value} className="flex items-start gap-3 p-3 border border-line rounded-lg cursor-pointer hover:bg-canvas transition-colors">
                <input
                  type="radio"
                  name="chargeType"
                  value={type.value}
                  checked={selectedChargeType === type.value}
                  onChange={(e) => setSelectedChargeType(e.target.value)}
                  className="mt-1"
                  required
                />
                <div>
                  <p className="font-semibold text-ink text-sm">{type.label}</p>
                  <p className="text-xs text-muted">{type.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Descripción */}
        <div>
          <label className="field-label">Descripción / Concepto *</label>
          <textarea
            name="description"
            maxLength={200}
            className="field-input w-full"
            rows={2}
            placeholder={chargeTypeInfo?.description}
            required
          />
          <p className="text-xs text-muted mt-1">Breve descripción del cargo para el estado de cuenta</p>
        </div>

        {/* Monto */}
        <div>
          <label className="field-label">Monto *</label>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            className="field-input w-full"
            placeholder="0.00"
            required
            disabled={!selectedProperty}
          />
        </div>

        {/* Fecha de Vencimiento */}
        <div>
          <label className="field-label">Fecha de Vencimiento *</label>
          <input
            name="dueDate"
            type="date"
            min={minDate}
            defaultValue={suggestedDueDateStr}
            className="field-input w-full"
            required
          />
          <p className="text-xs text-muted mt-1">
            Por defecto se sugieren 15 días. Elige una fecha futura.
          </p>
        </div>

        {/* Información de auditoría */}
        <div className="p-4 bg-info/5 border border-info rounded-lg">
          <p className="text-xs text-muted mb-2">📋 Al registrar este cargo:</p>
          <ul className="text-xs text-muted space-y-1">
            <li>✓ Se genera automáticamente un asiento contable</li>
            <li>✓ Se registra en la bitácora de actividad</li>
            <li>✓ Se crea un evento en el historial de la filial</li>
            <li>✓ El saldo se actualiza inmediatamente</li>
            <li>✓ Se notifica al residente si está configurado</li>
          </ul>
        </div>

        {/* Errores */}
        {state.formError && (
          <div className="p-3 bg-danger/5 border border-danger rounded-lg">
            <p className="text-sm text-danger">{state.formError}</p>
          </div>
        )}

        {state.errors && Object.entries(state.errors).length > 0 && (
          <div className="p-3 bg-warn/5 border border-warn rounded-lg">
            {Object.entries(state.errors).map(([field, errors]) => (
              <p key={field} className="text-xs text-warn">
                {field}: {errors.join(', ')}
              </p>
            ))}
          </div>
        )}

        {/* Success message */}
        {state.success && (
          <div className="p-3 bg-ok/5 border border-ok rounded-lg">
            <p className="text-sm text-ok">✅ Cargo registrado exitosamente. Recargando…</p>
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-3">
          <SubmitButton disabled={!selectedProperty} />
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-ghost"
          >
            Cancelar
          </button>
        </div>
      </form>

      {/* Info general */}
      <div className="mt-8 p-4 bg-canvas rounded-lg border border-line">
        <h3 className="font-semibold text-ink mb-2">ℹ️ Información sobre cargos</h3>
        <ul className="text-sm text-muted space-y-1">
          <li>• <strong>Cuota Extraordinaria:</strong> Derrama votada en asamblea (p.ej., reparaciones mayores)</li>
          <li>• <strong>Interés Moratorio:</strong> Calculado automáticamente por días de atraso</li>
          <li>• <strong>Multa:</strong> Sanción por incumplimiento de reglamento</li>
          <li>• <strong>Reposición de Daños:</strong> Cargo al responsable de daños al condominio</li>
          <li>• Los cargos se aplican inmediatamente al estado de cuenta del residente</li>
          <li>• Se puede modificar antes de ser pagado</li>
        </ul>
      </div>
    </div>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="btn-primary disabled:opacity-50"
    >
      {pending ? 'Registrando…' : 'Registrar Cargo'}
    </button>
  );
}
