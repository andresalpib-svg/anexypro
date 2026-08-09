/**
 * El día de HOY en el calendario de quien está usando el sistema,
 * en formato `YYYY-MM-DD` (el que espera un `<input type="date">`).
 *
 * POR QUÉ EXISTE: `new Date().toISOString().slice(0, 10)` devuelve la
 * fecha en UTC. En Costa Rica (UTC−6) eso significa que **a partir de
 * las 6:00 p.m. propone el día siguiente**. Como el valor se usa como
 * `defaultValue` de un campo de fecha, el campo ya viene lleno y nadie
 * lo revisa: el 8 de agosto a las 9 p.m. se registró un gasto de caja
 * chica y quedó fechado el 9 (prueba por rol del 2026-08-08).
 *
 * Se arma con los componentes locales, que es justo lo que el usuario
 * ve en su reloj.
 */
export function hoyISO(fecha: Date = new Date()): string {
  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

/**
 * Una fecha SIN hora —las columnas `@db.Date`: vencimiento de un cargo,
 * día de una reserva, fecha de un asiento, día de una asamblea— se lee
 * SIEMPRE en UTC.
 *
 * POR QUÉ: Postgres las entrega como medianoche UTC, así que
 * formatearlas con la zona de quien mira las corre un día hacia atrás
 * en todo el continente americano. En la prueba del 8/8/2026 una
 * reserva creada para el 14 se mostraba como 13, y las cuotas de un
 * condominio que vence el día 15 aparecían venciendo el 14. En Vercel
 * (UTC) no se nota, y por eso puede pasar mucho tiempo escondido: el
 * día que el servidor tenga otra zona, todas las fechas se corren.
 *
 * Para una marca de tiempo real —cuándo se envió, cuándo se registró—
 * NO se usa esto: ahí la hora local del usuario es la correcta.
 */
export function fechaSolo(valor: Date | string, opciones: Intl.DateTimeFormatOptions = {}): string {
  return new Date(valor).toLocaleDateString('es-CR', { ...opciones, timeZone: 'UTC' });
}
