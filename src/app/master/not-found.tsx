import { FileQuestion } from 'lucide-react';
import { EstadoPantalla } from '@/components/ui/estado-pantalla';

export default function NoEncontradoMaster() {
  return (
    <EstadoPantalla
      icon={FileQuestion}
      titulo="No encontramos esa página"
      mensaje="Puede que el enlace esté mal escrito o que el registro se haya eliminado."
      volverA="/master"
      volverTexto="Ir al panel de plataforma"
    />
  );
}
