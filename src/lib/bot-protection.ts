/**
 * Protección contra bots para formularios públicos (login, recuperar
 * contraseña) — sin CAPTCHA de terceros, que exigiría dar de alta una
 * cuenta en un proveedor externo (fuera de lo que se puede decidir
 * solo). Dos señales baratas, sin fricción para una persona real:
 *
 *  1. CAMPO TRAMPA ("honeypot"): un campo que NINGÚN humano llena
 *     —está oculto de la vista, no solo con `display:none` (algunos
 *     rastreadores lo ignoran), sino fuera del viewport y sin `tab`—
 *     pero que un script que rellena "cualquier campo de texto que
 *     encuentre" sí completa. Si llega con algo adentro, es un bot.
 *
 *  2. TIEMPO DE LLENADO: se manda la hora en que el formulario terminó
 *     de renderizarse; si la respuesta llega antes de lo que tarda un
 *     humano en leer dos campos y escribir en ellos (~1.2s), es un
 *     script enviando el formulario apenas lo carga. Un valor
 *     ausente, o de más de una hora (una página cacheada que alguien
 *     reutiliza para un scraper), también cuenta como sospechoso.
 *
 * Ninguna de las dos señales sale en la respuesta: el rechazo se ve
 * IGUAL que una credencial incorrecta (mismo mensaje, mismo tiempo),
 * para no darle a quien está probando esto una forma de calibrar el
 * detector por ensayo y error.
 */

/** Nombre del campo trampa. Deliberadamente genérico ("sitio web"): es
 *  de los primeros que un relleno automático de formularios completa. */
export const CAMPO_TRAMPA = 'sitio_web';

/** Nombre del campo con la hora de renderizado (epoch ms, como texto). */
export const CAMPO_RENDERIZADO = 'renderizado_en';

const MIN_MS_HUMANO = 1200;
const MAX_MS_RAZONABLE = 60 * 60 * 1000; // 1 hora

export function pareceBot(input: { honeypot?: string | null; renderedAt?: string | null }): boolean {
  if (input.honeypot && input.honeypot.trim() !== '') return true;

  const t = Number(input.renderedAt);
  if (!input.renderedAt || !Number.isFinite(t)) return true;

  const transcurrido = Date.now() - t;
  if (transcurrido < MIN_MS_HUMANO) return true;
  if (transcurrido > MAX_MS_RAZONABLE) return true;

  return false;
}
