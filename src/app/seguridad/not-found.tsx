import { FileQuestion } from 'lucide-react';
import { EstadoPantalla } from '@/components/ui/estado-pantalla';

export default function NoEncontradoSeguridad() {
  return (
    <EstadoPantalla
      icon={FileQuestion}
      titulo="No encontramos esa página"
      mensaje="Puede que el enlace esté mal escrito o que el registro ya no exista."
      volverA="/seguridad/dashboard"
      volverTexto="Volver a la caseta"
    />
  );
}
