import { headers } from 'next/headers';
import { CheckCircle2, AlertTriangle, XCircle, MinusCircle, RefreshCw } from 'lucide-react';
import { comprobarSistema, type EstadoCheck } from '@/lib/services/system-health';
import { PageHeader } from '@/components/ui/page-header';

/**
 * Estado del Sistema.
 *
 * Un tablero que dice, en el momento en que se abre, si cada servicio
 * del que depende ANEXYpro responde. No guarda nada ni corre solo:
 * pregunta en vivo, porque un estado guardado de hace una semana no
 * dice nada útil sobre si el correo funciona AHORA.
 *
 * `dynamic = 'force-dynamic'`: sin esto Next serviría la respuesta
 * cacheada y la pantalla mentiría con la comprobación de la vez
 * anterior — justo lo contrario de para lo que existe.
 */
export const dynamic = 'force-dynamic';

const ASPECTO: Record<
  EstadoCheck,
  { icono: typeof CheckCircle2; clase: string; fondo: string; etiqueta: string }
> = {
  ok: { icono: CheckCircle2, clase: 'text-ok', fondo: 'bg-ok-bg', etiqueta: 'Funcionando' },
  aviso: { icono: AlertTriangle, clase: 'text-warn', fondo: 'bg-warn-bg', etiqueta: 'Con avisos' },
  error: { icono: XCircle, clase: 'text-danger', fondo: 'bg-danger-bg', etiqueta: 'Con fallas' },
  apagado: { icono: MinusCircle, clase: 'text-muted', fondo: 'bg-canvas', etiqueta: 'Sin configurar' },
};

const TITULAR: Record<EstadoCheck, string> = {
  ok: 'Todo responde',
  aviso: 'Funciona, con avisos',
  error: 'Hay servicios caídos',
  apagado: 'Hay funciones sin configurar',
};

export default async function EstadoDelSistemaPage() {
  const anfitrion = headers().get('host') ?? undefined;
  const { comprobaciones, peor, generadoEn } = await comprobarSistema(anfitrion);

  const resumen = ASPECTO[peor];
  const IconoResumen = resumen.icono;
  const conProblema = comprobaciones.filter((c) => c.estado === 'error' || c.estado === 'aviso');

  return (
    <div>
      <PageHeader
        title="Estado del Sistema"
        subtitle="Comprobación en vivo de todo lo que ANEXYpro necesita para funcionar"
        action={
          // Un enlace, no un botón: recargar la página vuelve a correr
          // las comprobaciones, que es exactamente lo que se quiere.
          <a href="/master/estado" className="btn-ghost">
            <RefreshCw size={15} /> Volver a comprobar
          </a>
        }
      />

      <div className={`card mb-5 flex items-start gap-3 p-4 sm:p-5 ${resumen.fondo}`}>
        <IconoResumen className={`mt-0.5 flex-none ${resumen.clase}`} size={24} />
        <div className="min-w-0">
          <p className="font-sans text-base font-bold text-ink">{TITULAR[peor]}</p>
          <p className="mt-0.5 text-sm text-muted">
            {conProblema.length === 0
              ? `${comprobaciones.length} comprobaciones, ninguna con problemas.`
              : `${conProblema.length} de ${comprobaciones.length} necesitan atención: ${conProblema
                  .map((c) => c.titulo)
                  .join(' · ')}`}
          </p>
          <p className="mt-1 text-xs text-muted">Comprobado el {generadoEn.toLocaleString('es-CR')}</p>
        </div>
      </div>

      <ul className="space-y-3">
        {comprobaciones.map((c) => {
          const a = ASPECTO[c.estado];
          const Icono = a.icono;
          return (
            <li key={c.clave} className="card p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Icono className={`mt-0.5 flex-none ${a.clase}`} size={19} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="font-semibold text-ink">{c.titulo}</p>
                    <span className={`chip ${a.fondo} ${a.clase} text-[.65rem]`}>{a.etiqueta}</span>
                    <span className="ml-auto font-mono text-[.65rem] text-muted">{c.ms} ms</span>
                  </div>
                  <p className="mt-1 break-words text-sm text-muted">{c.detalle}</p>
                  {c.arreglo && (
                    <p className="mt-2 rounded-lg border-l-2 border-royal bg-royal-soft/60 px-3 py-2 text-sm text-ink-2">
                      <b className="font-semibold">Qué hacer: </b>
                      {c.arreglo}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-5 text-xs leading-relaxed text-muted">
        Estas comprobaciones consultan a cada proveedor en el momento de abrir la pantalla, con un
        plazo máximo de 8 segundos cada una. No modifican nada y no consumen crédito de la IA: solo
        preguntan si la credencial sigue siendo válida.
      </p>
    </div>
  );
}
