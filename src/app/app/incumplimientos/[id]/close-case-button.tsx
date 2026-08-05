'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { closeCaseAction } from '../actions';

/** Cerrar un expediente exige motivo: queda como constancia en la bitácora. */
export function CloseCaseButton({ caseId }: { caseId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, start] = useTransition();
  const router = useRouter();

  function cerrar() {
    setError(null);
    start(async () => {
      const r = await closeCaseAction(caseId, motivo);
      if (!r.ok) {
        setError(r.error ?? 'No se pudo cerrar.');
        return;
      }
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="btn-ghost">
        <CheckCircle2 size={16} /> Cerrar expediente
      </button>

      {abierto && (
        <Modal title="Cerrar expediente" onClose={() => setAbierto(false)}>
          <p className="text-sm text-muted">
            El expediente deja de escalar. Indicá el motivo: queda registrado en la bitácora.
          </p>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="El residente corrigió la situación…"
            className="field-input mt-3 w-full"
          />
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setAbierto(false)} className="btn-ghost">
              Cancelar
            </button>
            <button type="button" onClick={cerrar} disabled={enviando} className="btn-primary">
              {enviando ? 'Cerrando…' : 'Cerrar expediente'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
