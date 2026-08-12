import { prisma } from '@/lib/db';

/**
 * Freno de tasa por IP, respaldado en la tabla `rate_limit_hits`
 * (`RateLimitHit` en el esquema).
 *
 * POR QUÉ POSTGRES Y NO UN MAPA EN MEMORIA: este despliegue corre en
 * funciones serverless (Vercel) — un `Map` en memoria de proceso NO se
 * comparte entre instancias ni sobrevive un frío arranque, así que un
 * atacante distribuido entre varias invocaciones lo esquivaría sin
 * esfuerzo. La tabla es la única pieza de estado compartido disponible
 * sin sumar infraestructura nueva (no hay Redis/Upstash en este
 * despliegue).
 *
 * Se usa en los tres puntos de entrada SIN sesión donde la auditoría de
 * seguridad de 2026-08-11 encontró que no había ningún freno: login,
 * `/recuperar` y `/demo`.
 */

/** IP del cliente a partir de los encabezados de la petición. */
export function clientIp(headers: { get(name: string): string | null }): string | null {
  // Vercel (y cualquier proxy estándar) antepone la IP real del
  // cliente a `x-forwarded-for`; las siguientes son las de los saltos
  // intermedios.
  const fwd = headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip');
  if (real?.trim()) return real.trim();
  return null;
}

/**
 * ¿Ya se alcanzó el máximo de golpes en la ventana? NO registra un
 * golpe nuevo — eso lo hace `registerHit`, por separado, porque a
 * veces conviene comprobar antes de hacer trabajo caro y solo contar
 * el intento después (p. ej. contar únicamente los intentos de login
 * que SÍ fallaron, no cualquier petición).
 */
export async function isRateLimited(bucket: string, opts: { max: number; windowMs: number }): Promise<boolean> {
  const since = new Date(Date.now() - opts.windowMs);
  const count = await prisma.rateLimitHit.count({ where: { bucket, createdAt: { gte: since } } });
  return count >= opts.max;
}

/**
 * Registra un golpe en el bucket. De paso, con probabilidad baja,
 * borra golpes viejos — así la tabla no crece sin límite sin necesitar
 * un job de limpieza aparte para algo tan barato.
 */
export async function registerHit(bucket: string): Promise<void> {
  await prisma.rateLimitHit.create({ data: { bucket } }).catch(() => undefined);
  if (Math.random() < 0.01) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.rateLimitHit.deleteMany({ where: { createdAt: { lt: oneDayAgo } } }).catch(() => undefined);
  }
}

/**
 * Comprueba Y registra en un solo paso: para los casos donde cada
 * intento (exista o no la cuenta, exitoso o no) debe contar igual.
 */
export async function hitRateLimit(
  bucket: string,
  opts: { max: number; windowMs: number }
): Promise<{ allowed: boolean }> {
  const limited = await isRateLimited(bucket, opts);
  if (limited) return { allowed: false };
  await registerHit(bucket);
  return { allowed: true };
}
