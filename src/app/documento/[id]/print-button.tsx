'use client';

import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary py-1.5 text-xs">
      <Printer size={14} /> Imprimir / Guardar como PDF
    </button>
  );
}
