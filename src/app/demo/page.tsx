import type { Metadata } from 'next';
import { DemoRequest } from './demo-request';

export const metadata: Metadata = {
  title: 'Probá ANEXYpro — Demo',
  description: 'Creá una demo de ANEXYpro con datos de ejemplo, sin necesidad de una cuenta real.',
};

// Dinámica a la fuerza: la CSP con nonce por petición necesita HTML
// generado en cada petición — ver la nota completa en
// src/app/login/page.tsx.
export const dynamic = 'force-dynamic';

export default function DemoPage() {
  return <DemoRequest />;
}
