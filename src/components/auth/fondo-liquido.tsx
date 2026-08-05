import { Logo } from '@/components/ui/logo';

/**
 * Fondo de las pantallas de acceso: el plano del condominio como
 * textura del borde, masas de color de la marca que derivan despacio,
 * viñeta y un halo detrás del contenido.
 *
 * Se extrajo del formulario de acceso para que las pantallas de
 * recuperación se vean exactamente igual. Sin esto, tres pantallas del
 * mismo flujo terminarían con tres fondos distintos, que es como se
 * desarma la identidad de un producto.
 *
 * NO dibuja ningún contenedor: el contenido va suelto sobre el fondo.
 */
export function FondoLiquido({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-deep-dark px-5 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/login-blueprint.svg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center opacity-[0.16]"
          style={{
            maskImage: 'radial-gradient(58% 48% at 50% 50%, transparent 30%, #000 82%)',
            WebkitMaskImage: 'radial-gradient(58% 48% at 50% 50%, transparent 30%, #000 82%)',
          }}
        />
        <div
          className="liquid-blob liquid-blob-a left-[-18%] top-[-22%] h-[68vmax] w-[68vmax]"
          style={{ background: 'rgb(var(--royal-rgb) / 0.55)' }}
        />
        <div
          className="liquid-blob liquid-blob-b bottom-[-26%] right-[-20%] h-[62vmax] w-[62vmax]"
          style={{ background: 'rgb(var(--lumen-rgb) / 0.42)' }}
        />
        <div
          className="liquid-blob liquid-blob-a right-[6%] top-[-10%] h-[38vmax] w-[38vmax]"
          style={{ background: 'rgb(var(--lumen-rgb) / 0.3)', animationDelay: '-9s' }}
        />
        <div
          className="liquid-blob liquid-blob-b bottom-[8%] left-[10%] h-[34vmax] w-[34vmax]"
          style={{ background: 'rgb(var(--royal-dark-rgb) / 0.38)', animationDelay: '-15s' }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(80%_65%_at_50%_50%,transparent_10%,rgb(3_8_20/0.72)_75%,rgb(3_8_20/0.92))]" />
        <div className="absolute left-1/2 top-1/2 h-[42rem] w-[42rem] max-w-[130vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(3_8_20/0.55)_0%,rgb(3_8_20/0.28)_45%,transparent_70%)]" />
      </div>

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-10 flex justify-center">
          <Logo className="text-[2.75rem]" />
        </div>
        {children}
      </div>
    </div>
  );
}
