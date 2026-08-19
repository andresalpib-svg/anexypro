'use client';

import { useRouter } from 'next/navigation';

/** Selector de año para las pestañas de Reportes ancladas a un período (mismo patrón que Presupuesto). */
export function YearSelect({ tab, condoId, year, years }: { tab: string; condoId: string; year: number; years: number[] }) {
  const router = useRouter();
  return (
    <select
      value={year}
      onChange={(e) => router.push(`/app/reportes?tab=${tab}&condoId=${condoId}&anio=${e.target.value}`)}
      className="field-input w-28"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
