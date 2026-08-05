'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  Search,
  Camera,
  X,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Mail,
  MailWarning,
  Loader2,
  ArrowLeft,
  Gavel,
} from 'lucide-react';
import { searchPropertiesAction, briefingAction, previewAction, issueViolationAction, type IssueState } from './actions';

/**
 * Emisión en tres pasos.
 *
 * Todo ocurre en una sola pantalla y sin recargas: elegir la filial,
 * tocar el tipo de incumplimiento y adjuntar la evidencia. El objetivo
 * es que una notificación completa salga en menos de medio minuto, así
 * que no hay formularios largos ni edición de documentos: lo único que
 * se escribe —opcionalmente— es una observación corta.
 *
 * Qué se va a emitir (primera advertencia, segunda, o ya la multa) lo
 * decide el servidor con el historial de la filial. Aquí solo se
 * muestra por adelantado para que el usuario confirme con conocimiento.
 */

type Tipo = {
  id: string;
  name: string;
  description: string | null;
  regulationArticle: string | null;
  immediateFine: boolean;
  warningsRequired: number;
  fineAmount: string | number;
  icon: string | null;
};

type Hit = Awaited<ReturnType<typeof searchPropertiesAction>>[number];
type Briefing = Awaited<ReturnType<typeof briefingAction>>;
type Preview = Awaited<ReturnType<typeof previewAction>>;

const ESTADO_INICIAL: IssueState = {};

type Props = {
  condominiumId: string;
  condominiumName: string;
  tipos: Tipo[];
};

/**
 * El formulario se remonta con una `key` distinta para empezar de cero.
 *
 * Limpiar los campos no alcanza: `useFormState` conserva el resultado
 * de la última emisión, así que `state.success` sigue en true y la
 * pantalla de confirmación vuelve a dibujarse de inmediato — el botón
 * "Registrar otro incumplimiento" parecía no hacer nada. Cambiar la
 * `key` desmonta el componente y con él ese estado.
 */
export function QuickNotice(props: Props) {
  const [intento, setIntento] = useState(0);
  return <FormularioRapido key={intento} {...props} onNueva={() => setIntento((n) => n + 1)} />;
}

function FormularioRapido({
  condominiumId,
  condominiumName,
  tipos,
  onNueva,
}: Props & { onNueva: () => void }) {
  const [state, formAction] = useFormState(issueViolationAction, ESTADO_INICIAL);

  // Paso 1
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [buscando, startBuscar] = useTransition();
  const [filial, setFilial] = useState<Hit | null>(null);
  const [briefing, setBriefing] = useState<Briefing>(null);

  // Paso 2
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [preview, setPreview] = useState<Preview>(null);
  const [cargandoPreview, startPreview] = useTransition();

  // Paso 3
  const [archivos, setArchivos] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Buscador con retardo: no dispara una consulta por tecla.
  useEffect(() => {
    if (filial) return;
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      startBuscar(async () => setHits(await searchPropertiesAction(condominiumId, q)));
    }, 220);
    return () => clearTimeout(t);
  }, [query, condominiumId, filial]);

  async function elegirFilial(h: Hit) {
    setFilial(h);
    setHits([]);
    setQuery('');
    setBriefing(await briefingAction(h.propertyId));
  }

  function elegirTipo(t: Tipo) {
    setTipo(t);
    setPreview(null);
    if (!filial) return;
    startPreview(async () => setPreview(await previewAction(filial.propertyId, t.id)));
  }

  function reiniciar() {
    setFilial(null);
    setBriefing(null);
    setTipo(null);
    setPreview(null);
    setArchivos([]);
    setQuery('');
    formRef.current?.reset();
  }

  // Emitida: pantalla de confirmación.
  if (state.success && state.result) {
    return <Emitida result={state.result} onNueva={onNueva} />;
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <input type="hidden" name="propertyId" value={filial?.propertyId ?? ''} />
      <input type="hidden" name="violationTypeId" value={tipo?.id ?? ''} />

      {/* ---------------- Paso 1 ---------------- */}
      <section className="card p-5">
        <Encabezado n={1} titulo="Filial" listo={Boolean(filial)} />

        {!filial ? (
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Número de filial, propietario, casa o torre…"
              className="field-input w-full !pl-10 !py-3 !text-base"
              aria-label="Buscar filial"
            />
            {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted" size={16} />}

            {hits.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-paper shadow-lg">
                {hits.map((h) => (
                  <li key={h.propertyId}>
                    <button
                      type="button"
                      onClick={() => elegirFilial(h)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-canvas"
                    >
                      <span>
                        <span className="block font-semibold text-ink">{h.code}</span>
                        <span className="block text-xs text-muted">{h.ownerName ?? 'Sin propietario registrado'}</span>
                      </span>
                      <span className="text-xs text-muted">{h.condominiumName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!buscando && query.trim().length > 0 && hits.length === 0 && (
              <p className="mt-2 text-sm text-muted">Ninguna filial coincide con «{query}».</p>
            )}
          </div>
        ) : (
          <FilialElegida filial={filial} briefing={briefing} onCambiar={reiniciar} condominiumName={condominiumName} />
        )}
      </section>

      {/* ---------------- Paso 2 ---------------- */}
      {filial && (
        <section className="card p-5">
          <Encabezado n={2} titulo="Tipo de incumplimiento" listo={Boolean(tipo)} />

          {tipos.length === 0 ? (
            <p className="mt-3 rounded-xl bg-canvas p-4 text-sm text-muted">
              Todavía no hay tipos de incumplimiento configurados para este condominio. La administración los define
              en Configuración del módulo.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {tipos.map((t) => {
                const activo = tipo?.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => elegirTipo(t)}
                    className={`flex min-h-[84px] flex-col items-start justify-center gap-1 rounded-2xl border-2 px-4 py-3 text-left transition ${
                      activo
                        ? 'border-royal bg-royal-soft text-royal'
                        : 'border-line bg-paper text-ink hover:border-royal/50 hover:bg-canvas'
                    }`}
                  >
                    <span className="text-[15px] font-bold leading-tight">{t.name}</span>
                    {t.immediateFine ? (
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-danger">Multa inmediata</span>
                    ) : (
                      <span className="text-[11px] text-muted">
                        {t.warningsRequired} advertencia{t.warningsRequired === 1 ? '' : 's'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {cargandoPreview && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted">
              <Loader2 className="animate-spin" size={14} /> Revisando el historial de la filial…
            </p>
          )}
          {preview && <AvisoReincidencia preview={preview} />}
        </section>
      )}

      {/* ---------------- Paso 3 ---------------- */}
      {filial && tipo && (
        <section className="card p-5">
          <Encabezado n={3} titulo="Evidencia" listo={archivos.length > 0} opcional />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-3 text-sm font-semibold text-ink hover:border-royal hover:text-royal"
            >
              <Camera size={18} /> Tomar o adjuntar fotografías
            </button>
            <input
              ref={inputRef}
              type="file"
              name="evidences"
              accept="image/*,video/mp4,video/quicktime,video/webm"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                const nuevos = Array.from(e.target.files ?? []);
                setArchivos((prev) => [...prev, ...nuevos].slice(0, 8));
              }}
            />
          </div>

          {archivos.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {archivos.map((f, i) => (
                <li key={`${f.name}-${i}`} className="relative overflow-hidden rounded-xl border border-line">
                  {f.type.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={URL.createObjectURL(f)} alt={f.name} className="h-24 w-full object-cover" />
                  ) : (
                    <div className="flex h-24 w-full items-center justify-center bg-canvas text-xs text-muted">
                      {f.name.split('.').pop()?.toUpperCase()}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setArchivos((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 rounded-lg bg-ink/70 p-1 text-white"
                    aria-label={`Quitar ${f.name}`}
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <textarea
            name="observation"
            rows={2}
            placeholder="Observación corta (opcional)"
            className="field-input mt-3 w-full"
          />

          {state.formError && (
            <p className="mt-3 rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{state.formError}</p>
          )}

          <BotonEnviar preview={preview} />
        </section>
      )}
    </form>
  );
}

function Encabezado({ n, titulo, listo, opcional }: { n: number; titulo: string; listo: boolean; opcional?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
          listo ? 'bg-ok text-white' : 'bg-royal-soft text-royal'
        }`}
      >
        {listo ? <CheckCircle2 size={15} /> : n}
      </span>
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink">{titulo}</h2>
      {opcional && <span className="text-xs text-muted">— opcional</span>}
    </div>
  );
}

function FilialElegida({
  filial,
  briefing,
  onCambiar,
  condominiumName,
}: {
  filial: Hit;
  briefing: Briefing;
  onCambiar: () => void;
  condominiumName: string;
}) {
  return (
    <div className="mt-3 rounded-xl bg-canvas p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold text-ink">{filial.code}</p>
          <p className="text-sm text-ink">{filial.ownerName ?? 'Sin propietario registrado'}</p>
          <p className="text-xs text-muted">
            {filial.ownerEmail ?? 'Sin correo registrado'} · {condominiumName}
          </p>
        </div>
        <button type="button" onClick={onCambiar} className="flex items-center gap-1.5 text-sm font-semibold text-royal">
          <ArrowLeft size={14} /> Cambiar filial
        </button>
      </div>

      {briefing && (
        <div className="mt-3 flex flex-wrap gap-4 border-t border-line pt-3 text-xs">
          <Dato label="Expedientes" valor={briefing.totalCases} />
          <Dato label="Advertencias previas" valor={briefing.totalWarnings} />
          <Dato label="Multas" valor={briefing.totalFines} />
          <Dato label="Casos abiertos" valor={briefing.openCases.length} />
        </div>
      )}

      {briefing && briefing.openCases.length > 0 && (
        <ul className="mt-3 space-y-1">
          {briefing.openCases.map((c) => (
            <li key={c.caseId} className="text-xs text-muted">
              <span className="font-semibold text-ink">{c.typeName}</span> · expediente {c.caseNumber} ·{' '}
              {c.warningsIssued} advertencia{c.warningsIssued === 1 ? '' : 's'}
              {c.lastActionAt ? ` · última: ${new Date(c.lastActionAt).toLocaleDateString('es-CR')}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: number }) {
  return (
    <span>
      <span className="block text-base font-bold text-ink">{valor}</span>
      <span className="text-muted">{label}</span>
    </span>
  );
}

/** El aviso de reincidencia: dice qué corresponde y por qué. */
function AvisoReincidencia({ preview }: { preview: NonNullable<Preview> }) {
  const { action } = preview;
  if (action.kind === 'ninguna') {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        {action.reason}
      </p>
    );
  }

  const esMulta = action.kind === 'multa';
  return (
    <div
      className={`mt-3 rounded-xl px-4 py-3 text-sm ${
        esMulta ? 'bg-danger-bg text-danger' : 'bg-royal-soft text-royal'
      }`}
    >
      <p className="flex items-center gap-2 font-bold">
        {esMulta ? <Gavel size={16} /> : <AlertTriangle size={16} />}
        {action.label}
      </p>
      <p className="mt-1 leading-relaxed">{action.reason}</p>
      {action.tooSoon && (
        <p className="mt-2 text-xs font-semibold">
          Aviso: según la configuración deberían pasar {action.daysUntilAllowed} día(s) más desde la última acción.
          Podés emitirla igual si la situación lo amerita.
        </p>
      )}
    </div>
  );
}

function BotonEnviar({ preview }: { preview: Preview }) {
  const { pending } = useFormStatus();
  const bloqueado = preview?.action.kind === 'ninguna';

  return (
    <button
      type="submit"
      disabled={pending || bloqueado}
      className="btn-primary mt-4 w-full !py-3.5 !text-base disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <>
          <Loader2 className="animate-spin" size={18} /> Emitiendo…
        </>
      ) : (
        'Enviar notificación'
      )}
    </button>
  );
}

function Emitida({
  result,
  onNueva,
}: {
  result: NonNullable<IssueState['result']>;
  onNueva: () => void;
}) {
  const correo = {
    enviado: { icon: Mail, texto: 'Correo enviado al propietario', clase: 'text-ok' },
    sin_configurar: {
      icon: MailWarning,
      texto: 'El correo no salió: falta configurar el correo saliente de la administración',
      clase: 'text-warn',
    },
    sin_destinatario: {
      icon: MailWarning,
      texto: 'El propietario no tiene correo registrado',
      clase: 'text-warn',
    },
    error: { icon: MailWarning, texto: 'El correo no se pudo enviar', clase: 'text-danger' },
  }[result.emailStatus] ?? { icon: MailWarning, texto: 'Estado del correo desconocido', clase: 'text-muted' };

  const Icono = correo.icon;

  return (
    <div className="card p-8 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ok-bg text-ok">
        <CheckCircle2 size={30} />
      </span>
      <h2 className="mt-4 text-xl font-extrabold text-ink">
        {result.kind === 'multa' ? 'Multa aplicada' : `Notificación ${result.sequence}.ª emitida`}
      </h2>
      <p className="mt-1 text-sm text-muted">Expediente {result.caseNumber}</p>

      <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left text-sm">
        <li className={`flex items-center gap-2 ${correo.clase}`}>
          <Icono size={16} /> {correo.texto}
        </li>
        {result.documentRef && (
          <li className="flex items-center gap-2 text-ink">
            <FileText size={16} className="text-royal" />
            <a href={result.documentRef} target="_blank" rel="noreferrer" className="font-semibold text-royal underline">
              Ver el documento en PDF
            </a>
          </li>
        )}
        {result.chargeId && (
          <li className="flex items-center gap-2 text-ink">
            <Gavel size={16} className="text-danger" /> Cuenta por cobrar generada en Finanzas
          </li>
        )}
      </ul>

      <button type="button" onClick={onNueva} className="btn-primary mt-6">
        Registrar otro incumplimiento
      </button>
    </div>
  );
}
