import { FondoLiquido } from '@/components/auth/fondo-liquido';
import { SolicitudForm } from './solicitud-form';

export const metadata = { title: 'Restablecer contraseña — AnexyPRO' };

// Dinámica a la fuerza: la CSP con nonce por petición necesita HTML
// generado en cada petición — ver la nota completa en
// src/app/login/page.tsx.
export const dynamic = 'force-dynamic';

export default function RecuperarPage() {
  return (
    <FondoLiquido>
      <SolicitudForm />
    </FondoLiquido>
  );
}
