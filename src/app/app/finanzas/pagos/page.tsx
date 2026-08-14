'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { makePaymentAction, type ActionState } from '../actions';
import { StatusChip } from '@/components/ui/status-chip';

export default function PagosPage({
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
  const [preview, setPreview] = useState<{ appliedToCharges: number; advance: number } | null>(null);
  const [amount, setAmount] = useState('');
  const [state, formAction] = useFormState<ActionState, FormData>(makePaymentAction, {});
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
          // Si viene propertyId en URL, seleccionar automáticamente
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
      setPreview(null);
      setAmount('');
      setSelectedProperty(null);
      // Recargar propiedades para actualizar saldos
      if (condoId) {
        const timer = setTimeout(() => {
          window.location.reload();
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [state.success, condoId]);

  // Vista previa de aplicación del pago
  const calculatePreview = (amountValue: number) => {
    if (!selectedProperty || !amountValue) {
      setPreview(null);
      return;
    }
    // Aquí iría la lógica de allocatePaymentOldestFirst
    // Por ahora, estimación simple
    const balance = selectedProperty.balance;
    if (amountValue >= balance) {
      setPreview({ appliedToCharges: balance, advance: amountValue - balance });
    } else {
      setPreview({ appliedToCharges: amountValue, advance: 0 });
    }
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    if (value) {
      calculatePreview(parseFloat(value));
    } else {
      setPreview(null);
    }
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Registrar Pago</h1>
        <p className="text-sm text-muted mt-1">
          Registra pagos de cuotas ordinarias, extraordinarias y servicios
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
              setPreview(null);
              setAmount('');
            }}
            className="field-input w-full"
            required
          >
            <option value="">— Selecciona una filial —</option>
            {properties.map((prop) => (
              <option key={prop.id} value={prop.id}>
                {prop.code} — {prop.ownerName || 'Sin propietario'}{' '}
                {prop.balance > 0 && `(Saldo: ${fmt(prop.balance)})`}
              </option>
            ))}
          </select>
        </div>

        {/* Detalles de la filial seleccionada */}
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

        {/* Monto */}
        <div>
          <label className="field-label">Monto a Pagar *</label>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            className="field-input w-full"
            placeholder="0.00"
            required
            disabled={!selectedProperty}
          />
        </div>

        {/* Vista previa de aplicación */}
        {preview && amount && (
          <div className="p-4 bg-info/5 border border-info rounded-lg">
            <p className="text-xs text-muted mb-2">Vista previa de aplicación:</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted">Aplicado a cargos</p>
                <p className="font-semibold text-ink">{fmt(preview.appliedToCharges)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Adelanto de condómino</p>
                <p className={`font-semibold ${preview.advance > 0 ? 'text-ok' : 'text-muted'}`}>
                  {fmt(preview.advance)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Método de pago */}
        <div>
          <label className="field-label">Método de Pago *</label>
          <select name="method" defaultValue="sinpe" className="field-input w-full" required>
            <option value="sinpe">SINPE Móvil</option>
            <option value="transferencia">Transferencia Bancaria</option>
            <option value="deposito">Depósito en Cuenta</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta de Crédito</option>
            <option value="comprobante">Solo Comprobante</option>
          </select>
        </div>

        {/* Referencia */}
        <div>
          <label className="field-label">
            Referencia <span className="text-xs text-muted">(opcional)</span>
          </label>
          <input
            name="reference"
            type="text"
            maxLength={80}
            className="field-input w-full"
            placeholder="Número de transferencia, comprobante, etc."
          />
          <p className="text-xs text-muted mt-1">Usada para evitar duplicados y auditoría</p>
        </div>

        {/* Notas */}
        <div>
          <label className="field-label">
            Notas <span className="text-xs text-muted">(opcional)</span>
          </label>
          <textarea
            name="notes"
            maxLength={300}
            className="field-input w-full"
            rows={2}
            placeholder="Información adicional sobre este pago"
          />
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
            <p className="text-sm text-ok">✅ Pago registrado exitosamente. Recargando…</p>
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-3">
          <SubmitButton disabled={!selectedProperty || !amount} />
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-ghost"
          >
            Cancelar
          </button>
        </div>
      </form>

      {/* Info de validación */}
      <div className="mt-8 p-4 bg-canvas rounded-lg border border-line">
        <h3 className="font-semibold text-ink mb-2">ℹ️ Información sobre pagos</h3>
        <ul className="text-sm text-muted space-y-1">
          <li>• Los pagos se aplican automáticamente a los cargos más antiguos primero</li>
          <li>• Los pagos parciales se registran y se pueden pagar en cuotas</li>
          <li>• Si el pago es mayor que el saldo, el excedente queda como adelanto</li>
          <li>• La referencia debe ser única para evitar duplicados</li>
          <li>• Todos los pagos quedan registrados en la auditoría</li>
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
      {pending ? 'Registrando…' : 'Registrar Pago'}
    </button>
  );
}
