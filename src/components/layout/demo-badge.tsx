import { FlaskConical } from 'lucide-react';
import { daysRemaining } from '@/lib/domain/demo-lifecycle';

/**
 * "Cuenta DEMO · X días restantes" — identificación visual pedida en
 * el PASO 3, para que quien use una cuenta demo (autoservicio o creada
 * por un master) sepa en todo momento que lo es y cuánto le queda. No
 * oculta ni restringe nada: es solo un aviso.
 */
export function DemoBadge({ expiresAt }: { expiresAt: Date | null }) {
  const dias = daysRemaining(expiresAt, new Date());
  return (
    <div className="flex items-center gap-1.5 border-b border-royal/20 bg-royal/10 px-4 py-1.5 text-xs font-semibold text-royal sm:px-6">
      <FlaskConical size={13} />
      Cuenta DEMO · {dias} día{dias === 1 ? '' : 's'} restante{dias === 1 ? '' : 's'}
    </div>
  );
}
