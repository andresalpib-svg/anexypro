'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { Droplets, Settings2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { StatusChip } from '@/components/ui/status-chip';
import { waterAmount, type WaterTier } from '@/lib/domain/water';
import { saveWaterConfigAction, registerWaterChargeAction, type ActionState } from './actions';

export type WaterRowView = {
  propertyId: string;
  code: string;
  ownerName: string | null;
  previousReading: number;
  reading: {
    previous: number;
    current: number;
    consumption: number;
    chargeAmount: number | null;
    chargeStatus: string | null;
  } | null;
};

export type WaterConfigView = {
  mode: 'sin_cobro' | 'tarifa_plana' | 'escalonado';
  flatFee: number;
  tiers: WaterTier[];
};

const MODE_LABEL: Record<string, string> = {
  sin_cobro: 'Sin cobro de agua',
  tarifa_plana: 'Tarifa plana mensual',
  escalonado: 'Por consumo (tarifa escalonada)',
};

const CHARGE_STATUS: Record<string, { label: string; variant: 'ok' | 'warn' | 'neutral' | 'royal' }> = {
  pendiente: { label: 'Cobro pendiente', variant: 'warn' },
  parcial: { label: 'Pago parcial', variant: 'royal' },
  pagado: { label: 'Pagado', variant: 'ok' },
  anulado: { label: 'Anulado', variant: 'neutral' },
};

/**
 * Cobro de agua potable por filial: lectura del medidor → consumo →
 * monto según la tarifa configurada → cargo en el estado de cuenta.
 * El monto se previsualiza con el MISMO cálculo del servidor
 * (src/lib/domain/water.ts), así lo que se ve es lo que se cobra.
 */
export function WaterBilling({
  condominiumId,
  currency,
  period,
  config,
  rows,
  canConfigure,
}: {
  condominiumId: string;
  currency: string;
  /** 'YYYY-MM' del período mostrado. */
  period: string;
  config: WaterConfigView;
  rows: WaterRowView[];
  canConfigure: boolean;
}) {
  const router = useRouter();
  const [showConfig, setShowConfig] = useState(false);

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  const cambiarMes = (mes: string) => {
    if (mes) router.push(`/app/finanzas?condoId=${condominiumId}&aguaMes=${mes}`, { scroll: false });
  };

  return (
    <div className="card mt-4 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
          <Droplets size={14} /> Cobro de agua potable
        </p>
        <span className="text-[.7rem] text-muted">{MODE_LABEL[config.mode]}</span>
        <div className="ml-auto flex items-center gap-2">
          {config.mode !== 'sin_cobro' && (
            <div>
              <label className="mr-1.5 text-[.7rem] font-semibold text-muted">Período</label>
              <input
                type="month"
                value={period}
                onChange={(e) => cambiarMes(e.target.value)}
                className="field-input w-40 py-1.5 text-xs"
              />
            </div>
          )}
          {canConfigure && (
            <button type="button" onClick={() => setShowConfig(true)} className="btn-ghost py-1.5 text-xs">
              <Settings2 size={13} /> Configurar
            </button>
          )}
        </div>
      </div>

      {config.mode === 'sin_cobro' ? (
        <p className="text-sm text-muted">
          Este condominio no cobra el agua a través de ANEXYpro.
          {canConfigure
            ? ' Configurá la tarifa (plana o escalonada por consumo) para habilitar el registro de lecturas y el cobro por filial.'
            : ' La administración puede habilitarlo desde "Configurar".'}
        </p>
      ) : (
        <>
          {config.mode === 'escalonado' && (
            <p className="mb-3 text-xs text-muted">
              Tarifa escalonada marginal:{' '}
              {config.tiers.map((t, i) => {
                const desde = i === 0 ? 0 : config.tiers[i - 1]!.upToM3;
                return (
                  <span key={i}>
                    {i > 0 && ' · '}
                    {t.upToM3 === null ? `más de ${desde} m³` : `${desde}–${t.upToM3} m³`} a {fmt(t.pricePerM3)}
                  </span>
                );
              })}
              . Cada tramo cobra solo los m³ que caen dentro de él.
            </p>
          )}
          {config.mode === 'tarifa_plana' && (
            <p className="mb-3 text-xs text-muted">
              Todas las filiales pagan {fmt(config.flatFee)} por mes; la lectura queda registrada como
              referencia de consumo.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2.5">Filial</th>
                  <th className="px-3 py-2.5 text-right">Lectura anterior</th>
                  <th className="px-3 py-2.5 text-right">Lectura actual</th>
                  <th className="px-3 py-2.5 text-right">Consumo</th>
                  <th className="px-3 py-2.5 text-right">Monto</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted">
                      Sin unidades activas en este condominio.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <WaterRow
                      key={`${r.propertyId}-${period}`}
                      row={r}
                      condominiumId={condominiumId}
                      period={period}
                      config={config}
                      fmt={fmt}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showConfig && (
        <WaterConfigModal condominiumId={condominiumId} config={config} currency={currency} onDone={() => setShowConfig(false)} />
      )}
    </div>
  );
}

function SubmitRow() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-1.5 text-xs">
      {pending ? 'Generando…' : 'Generar cobro'}
    </button>
  );
}

function WaterRow({
  row,
  condominiumId,
  period,
  config,
  fmt,
}: {
  row: WaterRowView;
  condominiumId: string;
  period: string;
  config: WaterConfigView;
  fmt: (n: number) => string;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(registerWaterChargeAction, {});
  const [previous, setPrevious] = useState(String(row.previousReading));
  const [current, setCurrent] = useState('');
  const shown = useRef(false);

  useEffect(() => {
    if (state.success && !shown.current) {
      shown.current = true;
      toast.success(`Cobro de agua de ${row.code} generado.`);
    }
    if (state.formError) toast.error(state.formError);
  }, [state, row.code]);

  // Ya registrada: solo se muestra. La restricción única del período
  // garantiza que no se cobra dos veces.
  if (row.reading) {
    const st = row.reading.chargeStatus ? CHARGE_STATUS[row.reading.chargeStatus] : null;
    return (
      <tr className="border-b border-line last:border-0">
        <td className="px-3 py-2.5">
          <p className="font-medium text-ink">{row.code}</p>
          {row.ownerName && <p className="text-[.7rem] text-muted">{row.ownerName}</p>}
        </td>
        <td className="px-3 py-2.5 text-right text-muted">{row.reading.previous}</td>
        <td className="px-3 py-2.5 text-right text-muted">{row.reading.current}</td>
        <td className="px-3 py-2.5 text-right font-medium text-ink">{row.reading.consumption} m³</td>
        <td className="px-3 py-2.5 text-right font-sans font-bold text-ink">
          {row.reading.chargeAmount !== null ? fmt(row.reading.chargeAmount) : '—'}
        </td>
        <td className="px-3 py-2.5 text-right">
          {st ? <StatusChip variant={st.variant}>{st.label}</StatusChip> : <StatusChip variant="neutral">Registrada</StatusChip>}
        </td>
      </tr>
    );
  }

  const prevN = Number(previous) || 0;
  const currN = Number(current);
  const consumo = current !== '' && currN >= prevN ? Math.round((currN - prevN) * 100) / 100 : null;
  const monto =
    consumo === null
      ? null
      : config.mode === 'tarifa_plana'
        ? config.flatFee
        : waterAmount(config.tiers, consumo);

  return (
    <tr className="border-b border-line align-middle last:border-0">
      <td className="px-3 py-2.5">
        <p className="font-medium text-ink">{row.code}</p>
        {row.ownerName && <p className="text-[.7rem] text-muted">{row.ownerName}</p>}
      </td>
      <td className="px-3 py-2.5 text-right">
        <input
          type="number"
          step="0.01"
          min="0"
          value={previous}
          onChange={(e) => setPrevious(e.target.value)}
          className="field-input w-24 py-1.5 text-right text-xs"
          form={`agua-${row.propertyId}`}
          name="previousReading"
        />
      </td>
      <td className="px-3 py-2.5 text-right">
        <form id={`agua-${row.propertyId}`} action={formAction}>
          <input type="hidden" name="condominiumId" value={condominiumId} />
          <input type="hidden" name="propertyId" value={row.propertyId} />
          <input type="hidden" name="period" value={period} />
          <input
            type="number"
            step="0.01"
            min="0"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="m³"
            className="field-input w-24 py-1.5 text-right text-xs"
            name="currentReading"
          />
        </form>
      </td>
      <td className="px-3 py-2.5 text-right text-ink">
        {consumo !== null ? `${consumo} m³` : current !== '' ? <span className="text-danger">¿menor?</span> : '—'}
      </td>
      <td className="px-3 py-2.5 text-right font-sans font-semibold text-ink">
        {monto !== null ? fmt(monto) : '—'}
      </td>
      <td className="px-3 py-2.5 text-right">
        <button
          type="submit"
          form={`agua-${row.propertyId}`}
          disabled={consumo === null}
          className="btn-primary py-1.5 text-xs disabled:opacity-40"
        >
          Generar cobro
        </button>
      </td>
    </tr>
  );
}

/**
 * Configuración del cobro: modo, tarifa plana o tramos escalonados.
 * Los tramos se editan como filas y viajan como JSON en un campo
 * oculto — el servidor los valida de nuevo (validateTiers).
 */
function WaterConfigModal({
  condominiumId,
  config,
  currency,
  onDone,
}: {
  condominiumId: string;
  config: WaterConfigView;
  currency: string;
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(saveWaterConfigAction, {});
  const [mode, setMode] = useState<string>(config.mode);
  const [flatFee, setFlatFee] = useState(String(config.flatFee || ''));
  const [tiers, setTiers] = useState<{ upToM3: string; pricePerM3: string }[]>(
    config.tiers.length > 0
      ? config.tiers.map((t) => ({ upToM3: t.upToM3 === null ? '' : String(t.upToM3), pricePerM3: String(t.pricePerM3) }))
      : [{ upToM3: '10', pricePerM3: '' }, { upToM3: '', pricePerM3: '' }]
  );

  useEffect(() => {
    if (state.success) {
      toast.success('Configuración de agua guardada.');
      onDone();
    }
  }, [state.success, onDone]);

  const tiersJson = JSON.stringify(
    tiers.map((t) => ({ upToM3: t.upToM3.trim() === '' ? null : Number(t.upToM3), pricePerM3: Number(t.pricePerM3) }))
  );

  return (
    <Modal
      title="Cobro de agua potable"
      subtitle="Cómo se calcula el monto que se le cobra a cada filial"
      onClose={onDone}
      width="max-w-xl"
    >
      <form action={formAction} className="space-y-4 p-5">
        <input type="hidden" name="condominiumId" value={condominiumId} />
        <input type="hidden" name="tiers" value={tiersJson} />

        <div>
          <label className="field-label">Modo de cobro</label>
          <select name="mode" value={mode} onChange={(e) => setMode(e.target.value)} className="field-input">
            <option value="sin_cobro">Sin cobro — el agua no se factura por ANEXYpro</option>
            <option value="tarifa_plana">Tarifa plana — mismo monto mensual para toda filial</option>
            <option value="escalonado">Por consumo — tarifa escalonada por m³</option>
          </select>
        </div>

        {mode === 'tarifa_plana' && (
          <div>
            <label className="field-label">Monto mensual ({currency})</label>
            <input
              name="flatFee"
              type="number"
              step="0.01"
              min="0"
              value={flatFee}
              onChange={(e) => setFlatFee(e.target.value)}
              className="field-input w-44"
            />
          </div>
        )}
        {mode !== 'tarifa_plana' && <input type="hidden" name="flatFee" value={flatFee || '0'} />}

        {mode === 'escalonado' && (
          <div>
            <label className="field-label">Tramos de la tarifa (marginal, como la de AyA)</label>
            <div className="space-y-2">
              {tiers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-14 text-xs text-muted">Tramo {i + 1}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={t.upToM3}
                    onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, upToM3: e.target.value } : x)))}
                    placeholder={i === tiers.length - 1 ? 'en adelante' : 'hasta m³'}
                    className="field-input w-32 text-xs"
                  />
                  <span className="text-xs text-muted">m³ a</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={t.pricePerM3}
                    onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, pricePerM3: e.target.value } : x)))}
                    placeholder={`${currency} por m³`}
                    className="field-input w-36 text-xs"
                  />
                  {tiers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setTiers(tiers.filter((_, j) => j !== i))}
                      className="text-muted transition hover:text-danger"
                      aria-label={`Quitar tramo ${i + 1}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setTiers([...tiers, { upToM3: '', pricePerM3: '' }])}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-royal hover:underline"
            >
              <Plus size={12} /> Agregar tramo
            </button>
            <p className="mt-2 text-[.7rem] leading-relaxed text-muted">
              El último tramo puede quedar sin techo (vacío = &quot;en adelante&quot;). Cada tramo cobra
              solo los m³ que caen dentro de él: con 0–10 a 500 y el resto a 800, un consumo de 12 m³
              paga 10×500 + 2×800.
            </p>
          </div>
        )}

        {state.formError && <p className="text-xs font-medium text-danger">{state.formError}</p>}
        {state.errors &&
          Object.values(state.errors).map((m, i) => (
            <p key={i} className="text-xs font-medium text-danger">
              {m?.[0]}
            </p>
          ))}

        <div className="flex gap-2 border-t border-line pt-4">
          <SubmitConfig />
          <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SubmitConfig() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">
      {pending ? 'Guardando…' : 'Guardar configuración'}
    </button>
  );
}
