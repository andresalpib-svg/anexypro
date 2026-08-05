import { redirect } from 'next/navigation';

// Propiedades y Residentes ahora son un solo módulo.
export default function ResidentesPage({ searchParams }: { searchParams: { condoId?: string } }) {
  redirect(searchParams.condoId ? `/app/propiedades?condoId=${searchParams.condoId}` : '/app/propiedades');
}
