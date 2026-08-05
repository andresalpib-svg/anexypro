import { FileQuestion } from 'lucide-react';
import { EstadoPantalla } from '@/components/ui/estado-pantalla';

export default function NoEncontradoPortal() {
  return (
    <EstadoPantalla
      icon={FileQuestion}
      titulo="No encontramos esa página"
      mensaje="Puede que el enlace esté mal escrito o que el contenido ya no esté disponible. Si llegaste desde un correo, avisá a la administración de tu condominio."
      volverA="/portal/dashboard"
      volverTexto="Ir a mi inicio"
    />
  );
}
