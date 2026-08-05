import { FileQuestion } from 'lucide-react';
import { EstadoPantalla } from '@/components/ui/estado-pantalla';

/**
 * 404 de las rutas que no caen en ninguna zona (panel, portal, caseta o
 * master). Enlaza a `/`, que reparte según el rol de la sesión.
 */
export default function NoEncontrado() {
  return (
    <div className="min-h-screen bg-canvas">
      <EstadoPantalla
        icon={FileQuestion}
        titulo="No encontramos esa página"
        mensaje="La dirección no corresponde a ninguna pantalla de ANEXYpro. Revisá el enlace o volvé al inicio."
        volverA="/"
      />
    </div>
  );
}
