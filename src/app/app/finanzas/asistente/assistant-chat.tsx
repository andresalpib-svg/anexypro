'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { Send, Sparkles, Table2, Lightbulb, ArrowRight, Bot, User, Loader2 } from 'lucide-react';
import { askAction } from './actions';
import type { AssistantAnswer } from '@/lib/services/financial-assistant';

type Turn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; answer: AssistantAnswer }
  | { role: 'error'; text: string };

export function AssistantChat({
  condominiumId,
  condoName,
  suggestions,
  hasAI,
}: {
  condominiumId: string;
  condoName: string;
  suggestions: string[];
  hasAI: boolean;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, pending]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    setTurns((prev) => [...prev, { role: 'user', text: q }]);
    setQuestion('');
    startTransition(async () => {
      const r = await askAction(condominiumId, q);
      setTurns((prev) => [
        ...prev,
        r.ok && r.answer ? { role: 'assistant', answer: r.answer } : { role: 'error', text: r.error ?? 'Error' },
      ]);
    });
  };

  return (
    <div className="grid grid-cols-[1fr_260px] gap-4 max-lg:grid-cols-1">
      <div className="card flex min-h-[32rem] flex-col overflow-hidden">
        {/* Conversación */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {turns.length === 0 && (
            <div className="py-10 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-royal-soft text-royal">
                <Sparkles size={22} />
              </span>
              <p className="mt-3 font-sans text-base font-bold text-ink">
                Preguntame sobre las finanzas de {condoName}
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                Respondo con los datos reales del sistema. Toda respuesta viene con la tabla de la que salió,
                para que puedas verificarla.
              </p>
            </div>
          )}

          {turns.map((t, i) => {
            if (t.role === 'user') {
              return (
                <div key={i} className="flex justify-end gap-2.5">
                  <p className="max-w-lg rounded-2xl rounded-br-sm bg-royal px-4 py-2.5 text-sm text-white">
                    {t.text}
                  </p>
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-canvas text-muted">
                    <User size={14} />
                  </span>
                </div>
              );
            }
            if (t.role === 'error') {
              return (
                <p key={i} className="rounded-lg bg-danger-bg/40 px-3 py-2 text-sm text-danger">
                  {t.text}
                </p>
              );
            }

            const a = t.answer;
            return (
              <div key={i} className="flex gap-2.5">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-royal-soft text-royal">
                  <Bot size={14} />
                </span>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="rounded-2xl rounded-tl-sm bg-canvas px-4 py-3">
                    <p className="font-sans text-sm font-bold text-ink">{a.headline}</p>
                    <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink">{a.narrative}</p>
                  </div>

                  {a.table && (
                    <div className="overflow-hidden rounded-xl border border-line">
                      <p className="flex items-center gap-1.5 border-b border-line bg-canvas px-3 py-2 text-[.7rem] font-bold uppercase tracking-wide text-muted">
                        <Table2 size={12} /> {a.table.title}
                      </p>
                      <div className="max-h-72 overflow-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-white text-left text-muted">
                            <tr>
                              {a.table.columns.map((c) => (
                                <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold">
                                  {c}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {a.table.rows.map((row, ri) => (
                              <tr key={ri} className="border-t border-line">
                                {row.map((cell, ci) => (
                                  <td
                                    key={ci}
                                    className={`whitespace-nowrap px-3 py-1.5 ${ci === 0 ? 'text-ink' : 'text-muted'}`}
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {a.recommendations.length > 0 && (
                    <div className="rounded-xl border border-warn/30 bg-warn-bg/25 p-3">
                      <p className="flex items-center gap-1.5 text-[.7rem] font-bold uppercase tracking-wide text-muted">
                        <Lightbulb size={12} className="text-warn" /> Recomendaciones
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {a.recommendations.map((r, ri) => (
                          <li key={ri} className="text-sm leading-relaxed text-ink">
                            • {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {a.actions.map((ac) => (
                      <Link key={ac.href} href={ac.href} className="btn-ghost py-1.5 text-xs">
                        {ac.label} <ArrowRight size={12} />
                      </Link>
                    ))}
                    <span className="ml-auto text-[.65rem] text-muted">
                      {a.writtenBy === 'ia' ? 'Análisis redactado con IA · cifras del sistema' : 'Análisis del sistema'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {pending && (
            <div className="flex items-center gap-2.5 text-sm text-muted">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-royal-soft text-royal">
                <Bot size={14} />
              </span>
              <Loader2 size={14} className="animate-spin" /> Analizando los datos…
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Entrada */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(question);
          }}
          className="flex gap-2 border-t border-line bg-white p-3"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Escribí tu pregunta…"
            className="field-input flex-1"
            disabled={pending}
          />
          <button type="submit" disabled={pending || question.trim().length < 3} className="btn-primary disabled:opacity-40">
            <Send size={15} />
          </button>
        </form>
      </div>

      {/* Preguntas sugeridas */}
      <div className="space-y-3">
        <div className="card p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Preguntas frecuentes</p>
          <div className="space-y-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={pending}
                onClick={() => send(s)}
                className="w-full rounded-lg border border-line px-3 py-2 text-left text-xs text-ink transition hover:border-royal hover:bg-royal-soft disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Cómo funciona</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            El asistente <b>no calcula</b>: todas las cifras salen de las mismas consultas que alimentan los
            estados financieros y el panel. {hasAI ? 'La IA solo las redacta en prosa.' : 'La IA redactaría el análisis, pero en este entorno todavía no está conectada — las respuestas las escribe el propio sistema con los mismos datos.'}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Tampoco ejecuta movimientos: no emite cargos, no registra pagos y no modifica asientos. Analiza,
            explica y sugiere; la acción siempre la hacés vos.
          </p>
        </div>
      </div>
    </div>
  );
}
