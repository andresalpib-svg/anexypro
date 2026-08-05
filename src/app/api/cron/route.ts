import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runAllJobs, runJob, listJobs } from '@/lib/jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Disparador de los procesos automáticos.
 *
 * Se autoriza de dos formas:
 *  - Con el encabezado `Authorization: Bearer <CRON_SECRET>` — es como
 *    lo llama el programador del hosting.
 *  - Con sesión de administrador propietario o master — para poder
 *    forzar una corrida desde el panel.
 *
 * Si `CRON_SECRET` no está configurado, el acceso por encabezado queda
 * DESHABILITADO. Nunca se abre el endpoint por falta de configuración:
 * un cron abierto al público permitiría a cualquiera disparar la
 * facturación de todos los condominios.
 */
async function authorize(req: Request): Promise<{ ok: boolean; via?: string }> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  if (secret && header === `Bearer ${secret}`) return { ok: true, via: 'cron' };

  const session = await auth();
  if (session?.user && ['admin_owner', 'master'].includes(session.user.role)) {
    return { ok: true, via: 'usuario' };
  }
  return { ok: false };
}

export async function GET(req: Request) {
  const authorized = await authorize(req);
  if (!authorized.ok) return new NextResponse('No autorizado', { status: 401 });

  const url = new URL(req.url);
  const only = url.searchParams.get('job');

  const results = only ? [await runJob(only)] : await runAllJobs();
  const failed = results.some((r) => r.status === 'error');

  return NextResponse.json(
    { ranAt: new Date().toISOString(), via: authorized.via, results },
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
