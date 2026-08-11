'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Ventana sobrepuesta a la página actual — el usuario nunca pierde el
 * contexto ni navega a otra pantalla. Cierra con la X, con clic fuera
 * del recuadro o con Esc.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  width = 'max-w-3xl',
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  // Portal a document.body: si no, el modal queda anidado en el DOM
  // donde se le invoque —incluido un <form> del formulario que lo
  // abre—, y un <form> dentro de otro <form> es HTML inválido: el
  // navegador rompe el envío del formulario de afuera. Antes de montar
  // no hay `document` (SSR), así que el primer render no porta nada.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Mientras la ventana está abierta, la página de fondo no se desplaza.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!montado) return null;

  // El relleno del fondo es el margen de la ventana con la orilla de la
  // pantalla: sin él, en un teléfono el recuadro toca los bordes.
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-deep/50 p-4 backdrop-blur-sm sm:p-6"
      onMouseDown={(e) => {
        if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
      }}
    >
      <div ref={boxRef} className={`my-auto w-full ${width} overflow-hidden rounded-2xl bg-white shadow-2xl`}>
        <header className="flex items-start gap-3 border-b border-line bg-white px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="font-sans text-base font-bold text-ink">{title}</h2>
            {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="flex-none rounded-lg p-1.5 text-muted transition hover:bg-canvas hover:text-ink"
          >
            <X size={17} />
          </button>
        </header>
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto sm:max-h-[calc(100vh-10rem)]">{children}</div>
      </div>
    </div>,
    document.body
  );
}
