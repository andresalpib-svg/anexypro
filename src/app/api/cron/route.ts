import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runAllJobs, runJob, listJobs } from '@/lib/jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Authorization = { ok: false } | { ok: true; via: 'cron' | 'master' | 'admin_owner'; companyId?: string };

/**
 * Disparador de los procesos automáticos.
 *
 * Se autoriza de tres formas, cada una con un alcance distinto:
 *  - Con el encabezado `Authorization: Bearer <CRON_SECRET>` — es como
 *    lo llama el programador del hosting. Alcance: TODA la plataforma.
 *  - Con sesión `master` — alcance: TODA la plataforma.
 *  - Con sesión `admin_owner` — para poder forzar una corrida desde el
 *    panel. Alcance: SOLO su propia empresa (`companyId`). Antes este
 *    caso quedaba sin acotar y un `admin_owner` de una empresa podía
 *    disparar facturación, interés moratorio o cobranza de TODAS las
 *    empresas de la plataforma con solo llamar a esta ruta — ver
 *    docs/auditoria-seguridad-2026-08-11.md, hallazgo #1.
 *
 * Si `CRON_SECRET` no está configurado, el acceso por encabezado queda
 * DESHABILITADO. Nunca se abre el endpoint por falta de configuración:
 * un cron abierto al público permitiría a cualquiera disparar la
 * facturación de todos los condominios.
 */
async function authorize(req: Request): Promise<Authorization> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  if (secret && header === `Bearer ${secret}`) return { ok: true, via: 'cron' };

  const session = await auth();
  if (session?.user?.role === 'master') return { ok: true, via: 'master' };
  if (session?.user?.role === 'admin_owner') {
    return { ok: true, via: 'admin_owner', companyId: session.user.companyId };
  }
  return { ok: false };
}

export async function GET(req: Request) {
  const authorized = await authorize(req);
  if (!authorized.ok) return new NextResponse('No autorizado', { status: 401 });

  const url = new URL(req.url);
  const only = url.searchParams.get('job');
  const opts = authorized.companyId ? { companyId: authorized.companyId } : undefined;

  // Un job de alcance "plataforma" pedido explícitamente por nombre no
  // pasa por `runAllJobs` (que lo saltaría en silencio) — se rechaza
  // aquí mismo con un mensaje claro en vez de dejar que `runJob` lo
  // devuelva como resultado "error" dentro del arreglo de resultados.
  if (only && opts?.companyId) {
    const job = listJobs().find((j) => j.name === only);
    if (job?.scope === 'plataforma') {
      return new NextResponse('Este proceso es de toda la plataforma: solo master o el programador pueden ejecutarlo.', {
        status: 403,
      });
    }
  }

  const results = only ? [await runJob(only, new Date(), false, opts)] : await runAllJobs(new Date(), opts);
  const failed = results.some((r) => r.status === 'error');

  return NextResponse.json(
    { ranAt: new Date().toISOString(), via: authorized.via, companyId: authorized.companyId, results },
    { status: failed ? 500 : 200 }
  );
}

/** Lista los procesos disponibles — útil para la pantalla de mantenimiento. */
export async function POST(req: Request) {
  const authorized = await authorize(req);
  if (!authorized.ok) return new NextResponse('No autorizado', { status: 401 });
  return NextResponse.json({
    jobs: listJobs().map((j) => ({ name: j.name, description: j.description })),
  });
}
