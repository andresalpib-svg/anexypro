import { Download } from 'lucide-react';

/**
 * Botón "Descargar reporte" de las pestañas de Finanzas y
 * Contabilidad. Cada pestaña pasa su clave y la ruta única
 * /app/finanzas/exportar decide qué hojas lleva el Excel — mismos
 * servicios que la pantalla, sin duplicar lógica.
 */
export function DescargarReporte({
  tab,
  condoId,
  label = 'Descargar reporte',
}: {
  tab: string;
  condoId: string;
  label?: string;
}) {
  return (
    <a
      href={`/app/finanzas/exportar?tab=${tab}&condoId=${condoId}`}
      download
      className="btn-ghost inline-flex flex-none items-center gap-1.5 py-2 text-xs"
    >
      <Download size={13} /> {label}
    </a>
  );
}
