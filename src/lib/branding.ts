/**
 * Identidad visual por empresa administradora.
 *
 * Cada empresa puede tener su color; su panel se pinta con él. De un
 * único color se derivan los cuatro tonos que usa la interfaz —el
 * normal, el oscuro para el estado activo, el suave de los fondos y el
 * de los bordes— para que el master elija un color y no cuatro, y para
 * que la relación entre ellos sea siempre la misma.
 *
 * Solo se personalizan los colores de MARCA. Los semánticos (verde de
 * éxito, ámbar de aviso, rojo de error) quedan fijos a propósito: el
 * rojo de un error tiene que ser rojo en todas las empresas.
 */

export const MARCA_POR_DEFECTO = {
  primary: '#3F6DF6',
  deep: '#0F172A',
} as const;

type RGB = { r: number; g: number; b: number };

export function parseHex(hex: string | null | undefined): RGB | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const canal = (c: RGB) => `${c.r} ${c.g} ${c.b}`;

/** Mezcla hacia blanco (t=1) o hacia negro (t=-1). */
function mezclar(c: RGB, t: number): RGB {
  const hacia = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  return {
    r: Math.round(c.r + (hacia - c.r) * k),
    g: Math.round(c.g + (hacia - c.g) * k),
    b: Math.round(c.b + (hacia - c.b) * k),
  };
}

/**
 * Variables CSS para el `style` del layout.
 *
 * Devuelve un objeto vacío cuando la empresa no tiene marca propia: así
 * el panel se queda con los valores de `globals.css` y no hay que
 * duplicar la paleta por defecto en dos sitios.
 */
export function brandStyle(company: {
  brandPrimary?: string | null;
  brandDeep?: string | null;
}): Record<string, string> {
  const estilo: Record<string, string> = {};

  const primary = parseHex(company.brandPrimary);
  if (primary) {
    estilo['--royal-rgb'] = canal(primary);
    estilo['--royal-dark-rgb'] = canal(mezclar(primary, -0.14));
    estilo['--royal-soft-rgb'] = canal(mezclar(primary, 0.9));
    estilo['--royal-line-rgb'] = canal(mezclar(primary, 0.72));
    // El acento de IA acompaña al color de la empresa.
    estilo['--lumen-rgb'] = canal(mezclar(primary, 0.22));
    estilo['--lumen-dark-rgb'] = canal(primary);
  }

  const deep = parseHex(company.brandDeep);
  if (deep) {
    estilo['--deep-rgb'] = canal(deep);
    estilo['--deep-dark-rgb'] = canal(mezclar(deep, -0.3));
    estilo['--deep-line-rgb'] = canal(mezclar(deep, 0.16));
  }

  return estilo;
}

/** Contraste WCAG entre este color y el blanco. */
export function contrasteConBlanco(hex: string): number {
  const c = parseHex(hex);
  if (!c) return 21;
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  return 1.05 / (L + 0.05);
}

/**
 * ¿Se puede poner texto blanco encima de este color?
 *
 * El umbral es **3:1**, no 4,5:1, porque este color se usa en botones y
 * distintivos: texto de 14 px en seminegrita, que WCAG clasifica como
 * texto grande. El propio azul de ANEXYpro está en 3,6:1 — con el
 * umbral de texto pequeño se rechazaría a sí mismo.
 *
 * Sirve para avisar en la pantalla del master cuando un color elegido
 * dejaría los botones ilegibles —un amarillo con texto blanco encima no
 * se lee— en vez de que el problema aparezca en producción.
 */
export function contrastaConBlanco(hex: string): boolean {
  return contrasteConBlanco(hex) >= 3;
}
