import type { Metadata } from 'next';
import { articulat } from './fonts/articulat';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'AnexyPRO — Administración de condominios',
  description: 'Plataforma de administración de condominios. Multiempresa, multicondominio, con IA integrada.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={articulat.variable}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
