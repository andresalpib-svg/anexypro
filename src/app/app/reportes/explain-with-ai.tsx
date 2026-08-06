'use client';

import { useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { explainReportAction } from './explain-actions';
import { enTransicion } from '@/lib/accion-segura';

export function ExplainWithAI({ tab }: { tab: string }) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => enTransicion(startTransition, async () => setExplanation(await explainReportAction(tab)))}
        disabled={isPending}
        className="btn-ia py-2 text-xs"
      >
        <Sparkles size={13} /> {isPending ? 'Explicando…' : 'Explícame este reporte'}
      </button>
      {explanation && (
        <div className="card mt-2 flex items-start gap-2 p-4">
          <Sparkles size={15} className="mt-0.5 flex-none text-lumen" />
          <p className="text-sm text-ink">{explanation}</p>
        </div>
      )}
    </div>
  );
}
