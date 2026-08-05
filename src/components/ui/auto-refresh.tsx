'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * "Tiempo real" pragmático: re-consulta los datos del servidor cada
 * `seconds` — suficiente para una caseta con varios oficiales sin
 * montar infraestructura de WebSockets.
 */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
