'use client';

import { ErrorPantalla } from '@/components/ui/error-pantalla';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPantalla error={error} reset={reset} volverA="/portal/dashboard" volverTexto="Ir a mi inicio" />;
}
