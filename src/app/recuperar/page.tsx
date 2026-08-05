import { FondoLiquido } from '@/components/auth/fondo-liquido';
import { SolicitudForm } from './solicitud-form';

export const metadata = { title: 'Restablecer contraseña — AnexyPRO' };

export default function RecuperarPage() {
  return (
    <FondoLiquido>
      <SolicitudForm />
    </FondoLiquido>
  );
}
