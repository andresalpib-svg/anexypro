import type { Metadata } from 'next';
import { DemoRequest } from './demo-request';

export const metadata: Metadata = {
  title: 'Probá ANEXYpro — Demo',
  description: 'Creá una demo de ANEXYpro con datos de ejemplo, sin necesidad de una cuenta real.',
};

export default function DemoPage() {
  return <DemoRequest />;
}
