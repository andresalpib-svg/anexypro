import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { FondoLiquido } from '@/components/auth/fondo-liquido';
import { verificarToken } from '@/lib/services/password-reset';
import { FijarForm } from './fijar-form';

export const metadata = { title: 'Elegir contraseña — AnexyPRO' };
export const dynamic = 'force-dynamic';

const MOTIVO: Record<string, string> = {
  vencido: 'Este enlace venció. Los enlaces duran 30 minutos por seguridad.',
  usado: 'Este enlace ya se usó. Cada enlace sirve una sola vez.',
  invalido: 'Este enlace no es válido.',
};

export default async function RestablecerPage({ params }: { params: { token: string } }) {
  const v = await verificarToken(params.token);

  if (!v.ok) {
    return (
      <FondoLiquido>
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-4 text-white/70" size={34} />
          <h1 className="font-sans text-[1.75rem] font-bold leading-tight tracking-tight text-white">
            No pudimos abrir el enlace
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/60">{MOTIVO[v.motivo]}</p>
          <p className="mt-8">
            <Link
              href="/recuperar"
              className="text-sm font-medium text-white/70 underline decoration-white/25 underline-offset-4 transition hover:text-white hover:decoration-white/60"
            >
              Pedir un enlace nuevo
            </Link>
          </p>
        </div>
      </FondoLiquido>
    );
  }

  return (
    <FondoLiquido>
      <FijarForm token={params.token} nombre={v.nombre} />
    </FondoLiquido>
  );
}
