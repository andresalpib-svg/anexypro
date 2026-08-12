import { prisma } from '@/lib/db';

/**
 * Programador de tareas de ANEXYpro.
 *
 * Next.js no tiene cron propio, así que los procesos periódicos se
 * ejecutan por una llamada HTTP a /api/cron protegida con un secreto.
 * En producción la dispara el programador del hosting (Vercel Cron,
 * un cron de servidor o un servicio externo); en desarrollo se puede
 * llamar a mano.
 *
 * La pieza importante NO es el disparador, es la BITÁCORA: cada
 * corrida se registra con una clave lógica única, así que si el
 * programador dispara dos veces el mismo día la segunda no vuelve a
 * cobrar ni a emitir nada. La idempotencia vive aquí y no en cada
 * job, para que sea imposible olvidarla.
 */

export type JobResult = {
  /** Resumen legible: es lo que verá el administrador en la bitácora. */
  summary: string;
  /** Detalle opcional para depurar. */
  details?: Record<string, unknown>;
};

export type JobDefinition = {
  name: string;
  description: string;
  /**
   * Clave lógica de esta corrida. Dos corridas con la misma clave
   * NO se ejecutan dos veces. Casi siempre es la fecha del día.
   */
  runKey: (now: Date) => string;
  run: (now: Date, opts?: { companyId?: string }) => Promise<JobResult>;
  /**
   * `'plataforma'` marca los procesos que no se pueden acotar a una
   * sola empresa (por ejemplo, vencimiento de demos, salud del
   * sistema). `/api/cron` los reserva para `CRON_SECRET` o `master`:
   * un `admin_owner` de sesión nunca puede dispararlos, ni siquiera
   * sobre su propia empresa. Por omisión, `'empresa'`.
   */
  scope?: 'empresa' | 'plataforma';
};

const registry = new Map<string, JobDefinition>();

export function registerJob(job: JobDefinition) {
  registry.set(job.name, job);
}

export function listJobs(): JobDefinition[] {
  return [...registry.values()];
}

export type ExecutionOutcome =
  | { job: string; status: 'ok'; summary: string }
  | { job: string; status: 'omitido'; summary: string }
  | { job: string; status: 'error'; summary: string };

/**
 * Ejecuta un job respetando la idempotencia.
 *
 * `force` salta la verificación de duplicado — útil para reprocesar a
 * mano, nunca para el disparador automático.
 *
 * `opts.companyId` acota la corrida a una sola empresa (lo usa
 * `/api/cron` para un `admin_owner` de sesión). Un job marcado
 * `scope: 'plataforma'` rechaza esa restricción — no tiene sentido
 * "correrlo para una empresa" — así que se responde con error en vez
 * de correrlo sin acotar, que sería la fuga que se quiere cerrar.
 * La clave de corrida incluye la empresa cuando está acotada, para que
 * una corrida individual no marque como "ya hecho" el día completo y
 * bloquee la corrida real de la plataforma (o al revés).
 */
export async function runJob(
  name: string,
  now = new Date(),
  force = false,
  opts?: { companyId?: string }
): Promise<ExecutionOutcome> {
  const job = registry.get(name);
  if (!job) return { job: name, status: 'error', summary: `El proceso "${name}" no existe.` };

  if (opts?.companyId && job.scope === 'plataforma') {
    return {
      job: name,
      status: 'error',
      summary: 'Este proceso es de toda la plataforma: solo el programador o un usuario master pueden ejecutarlo.',
    };
  }

  const runKey = opts?.companyId ? `${job.runKey(now)}:${opts.companyId}` : job.runKey(now);

  if (!force) {
    const previous = await prisma.jobRun.findUnique({
      where: { jobName_runKey: { jobName: name, runKey } },
    });
    // Solo se considera "ya ejecutado" si terminó bien. Una corrida
    // con error debe poder reintentarse.
    if (previous && previous.status === 'ok') {
      return { job: name, status: 'omitido', summary: `Ya se había ejecutado (${runKey}).` };
    }
    if (previous && previous.status === 'corriendo') {
      // Protección contra ejecución simultánea: si otra instancia lo
      // está corriendo, esta no debe duplicar el trabajo.
      const minutes = (Date.now() - previous.startedAt.getTime()) / 60000;
      if (minutes < 30) {
        return { job: name, status: 'omitido', summary: 'Ya hay una corrida en progreso.' };
      }
    }
  }

  const run = await prisma.jobRun.upsert({
    where: { jobName_runKey: { jobName: name, runKey } },
    create: { jobName: name, runKey, status: 'corriendo' },
    update: { status: 'corriendo', startedAt: new Date(), endedAt: null, error: null },
  });

  try {
    const result = await job.run(now, opts);
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: 'ok', endedAt: new Date(), summary: result.summary },
    });
    return { job: name, status: 'ok', summary: result.summary };
  } catch (err: any) {
    const message = err?.message ?? 'Error desconocido';
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: 'error', endedAt: new Date(), error: message },
    });
    return { job: name, status: 'error', summary: message };
  }
}

/**
 * Ejecuta todos los procesos registrados, uno tras otro.
 *
 * Con `opts.companyId` (un `admin_owner` de sesión, acotado a su
 * empresa), los procesos de alcance `'plataforma'` se saltan por
 * completo —ni se intentan ni cuentan como error— en vez de fallar
 * ruidosamente uno por uno.
 */
export async function runAllJobs(now = new Date(), opts?: { companyId?: string }): Promise<ExecutionOutcome[]> {
  const out: ExecutionOutcome[] = [];
  for (const job of registry.values()) {
    if (opts?.companyId && job.scope === 'plataforma') {
      out.push({ job: job.name, status: 'omitido', summary: 'Proceso de plataforma: reservado a master.' });
      continue;
    }
    // En serie a propósito: los jobs tocan las mismas tablas y
    // ejecutarlos en paralelo solo agregaría contención.
    out.push(await runJob(job.name, now, false, opts));
  }
  return out;
}
