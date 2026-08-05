import { FileQuestion } from 'lucide-react';
import { EstadoPantalla } from '@/components/ui/estado-pantalla';

export default function NoEncontradoPanel() {
  return (
    <EstadoPantalla
      icon={FileQuestion}
      titulo="No encontramos esa página"
      mensaje="Puede que el enlace esté mal escrito, que el registro se haya eliminado, o que pertenezca a un condominio que no tenés asignado."
      volverA="/app/dashboard"
      volverTexto="Ir al Dashboard"
    />
  );
}
