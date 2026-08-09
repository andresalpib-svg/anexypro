'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { setProjectStatusAction } from './actions';
import { enTransicion } from '@/lib/accion-segura';

export type KanbanProject = {
  id: string;
  name: string;
  status: string;
  budget: string;
  spent: number;
};

const COLUMNS: { key: string; label: string; accent: string }[] = [
  { key: 'planificado', label: 'Planificado', accent: 'border-t-muted' },
  { key: 'en_progreso', label: 'En progreso', accent: 'border-t-royal' },
  { key: 'pausado', label: 'Pausado', accent: 'border-t-warn' },
  { key: 'completado', label: 'Completado', accent: 'border-t-ok' },
  { key: 'cancelado', label: 'Cancelado', accent: 'border-t-danger' },
];

export function KanbanBoard({ projects, currency }: { projects: KanbanProject[]; currency: string }) {
  const [, startTransition] = useTransition();
  // Copia local para mover la tarjeta al instante; el servidor
  // revalida después y este efecto re-sincroniza con la verdad.
  const [optimistic, setOptimistic] = useState(projects);
  useEffect(() => setOptimistic(projects), [projects]);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const fmt = (n: number | string) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(n));

  const move = (id: string, status: string) => {
    const project = optimistic.find((p) => p.id === id);
    if (!project || project.status === status) return;
    setOptimistic((current) => current.map((p) => (p.id === id ? { ...p, status } : p)));
    enTransicion(startTransition, async () => {
      await setProjectStatusAction(id, status);
      toast.success(`"${project.name}" movido a ${COLUMNS.find((c) => c.key === status)?.label}.`);
    });
  };

  const onDrop = (status: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    move(e.dataTransfer.getData('text/plain'), status);
  };

  return (
    <div className="mt-5 grid grid-cols-5 gap-3 max-lg:grid-cols-2 max-lg:gap-4">
      {COLUMNS.map((col) => {
        const items = optimistic.filter((p) => p.status === col.key);
        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(col.key);
            }}
            onDragLeave={() => setDragOver((d) => (d === col.key ? null : d))}
            onDrop={onDrop(col.key)}
            className={`rounded-xl border-t-4 bg-canvas p-3 transition ${col.accent} ${
              dragOver === col.key ? 'ring-2 ring-royal/40' : ''
            }`}
          >
            <p className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-muted">
              {col.label}
              <span className="rounded-full bg-line px-2 py-0.5 text-[.65rem] text-ink">{items.length}</span>
            </p>
            <div className="min-h-16 space-y-2">
              {items.map((p) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', p.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  className="card cursor-grab p-3 active:cursor-grabbing"
                >
                  <div className="flex items-start gap-1.5">
                    <GripVertical size={13} className="mt-0.5 flex-none text-muted" />
                    <div className="min-w-0">
                      <Link href={`/app/proyectos/${p.id}`} className="text-sm font-semibold text-ink hover:text-royal hover:underline">
                        {p.name}
                      </Link>
                      {/*
                        Solo se muestra lo ejecutado cuando de verdad hay
                        algo registrado. El módulo para anotar gastos de
                        proyecto se retiró (ese trabajo pasó a Finanzas) y
                        `Expense` no tiene forma de apuntar a un proyecto,
                        así que `spent` es 0 para todo lo nuevo: "₡0 de
                        ₡2 100 000" se leía como un proyecto sin ejecutar,
                        no como un dato que ya nadie alimenta.
                      */}
                      <p className="mt-1 text-[.7rem] text-muted">
                        {p.spent > 0 ? `${fmt(p.spent)} de ${fmt(p.budget)}` : `Presupuesto ${fmt(p.budget)}`}
                      </p>
                      {/* Alternativa al arrastre — también sirve en pantallas táctiles */}
                      <select
                        value=""
                        onChange={(e) => e.target.value && move(p.id, e.target.value)}
                        className="mt-1.5 w-full rounded-md border border-line bg-transparent px-1 py-0.5 text-[.68rem] text-muted"
                      >
                        <option value="" disabled>
                          Mover a…
                        </option>
                        {COLUMNS.filter((c) => c.key !== p.status).map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <p className="rounded-lg border border-dashed border-line p-3 text-center text-[.7rem] text-muted">
                  Arrastra un proyecto aquí
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
