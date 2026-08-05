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
  run: (now: Date) => Promise<JobResult>;
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
 */
export async function runJob(name: string, now = new Date(), force = false): Promise<ExecutionOutcome> {
  const job = registry.get(name);
  if (!job) return { job: name, status: 'error', summary: `El proceso "${name}" no existe.` };

  const runKey = job.runKey(now);

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
    const result = await job.run(now);
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

/** Ejecuta todos los procesos registrados, uno tras otro. */
export async function runAllJobs(now = new Date()): Promise<ExecutionOutcome[]> {
  const out: ExecutionOutcome[] = [];
  for (const job of registry.values()) {
    // En serie a propósito: los jobs tocan las mismas tablas y
    // ejecutarlos en paralelo solo agregaría contención.
    out.push(await runJob(job.name, now));
  }
  return out;
}
