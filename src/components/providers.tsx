'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'sonner';
import { IdleLogout } from '@/components/layout/idle-logout';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <IdleLogout />
      <Toaster position="top-right" richColors />
    </SessionProvider>
  );
}
