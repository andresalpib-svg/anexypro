'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { saveHiddenModulesAction } from './actions';
import type { ToggleableModule } from '@/lib/services/module-visibility';
import { enTransicion } from '@/lib/accion-segura';

export type CompanyOption = { id: string; name: string };

export function ModuleToggles({
  companies,
  selectedId,
  modules,
  hidden,
}: {
  companies: CompanyOption[];
  selectedId: string;
  modules: ToggleableModule[];
  hidden: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<string[]>(hidden);

  const isHidden = (href: string) => draft.includes(href);
  const toggle = (href: string) =>
    setDraft((prev) => (prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href]));

  const dirty =
    draft.length !== hidden.length || draft.some((h) => !hidden.includes(h));

  // Las categorías se muestran en el mismo orden del menú lateral.
  const grouped = modules.reduce<Record<string, ToggleableModule[]>>((acc, m) => {
    (acc[m.category] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedId}
          onChange={(e) => router.push(`/master/modulos?companyId=${e.target.value}`)}
          className="field-input w-auto min-w-72"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">
          {draft.length === 0 ? 'Todos los módulos visibles' : `${draft.length} módulo${draft.length === 1 ? '' : 's'} oculto${draft.length === 1 ? '' : 's'}`}
        </span>
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={() =>
            enTransicion(startTransition, async () => {
              const r = await saveHiddenModulesAction(selectedId, draft);
              if (r.ok) {
                toast.success('Configuración de módulos guardada.');
                router.refresh();
              } else toast.error(r.error);
            })
          }
          className="btn-primary ml-auto py-2 text-xs disabled:opacity-40"
        >
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

      <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs leading-relaxed text-muted">
        Los módulos ocultos desaparecen del menú de esta empresa y su dirección queda bloqueada, incluso si el
        usuario la escribe a mano. El Dashboard no se puede ocultar porque es la pantalla de entrada al panel.
      </p>

      <div className="mt-4 space-y-4">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="card p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{category}</p>
            <div className="grid grid-cols-2 gap-2 max-lg:grid-cols-1">
              {items.map((m) => (
                <button
                  key={m.href}
                  type="button"
                  onClick={() => toggle(m.href)}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    isHidden(m.href)
                      ? 'border-line bg-canvas text-muted'
                      : 'border-royal/30 bg-royal-soft text-ink'
                  }`}
                >
                  {isHidden(m.href) ? (
                    <EyeOff size={15} className="flex-none text-muted" />
                  ) : (
                    <Eye size={15} className="flex-none text-royal" />
                  )}
                  <span className={`flex-1 truncate ${isHidden(m.href) ? 'line-through' : 'font-medium'}`}>
                    {m.label}
                  </span>
                  <span className="flex-none text-[.65rem] uppercase tracking-wide">
                    {isHidden(m.href) ? 'oculto' : 'visible'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
