import type { Config } from 'tailwindcss';

// Paleta "Azul Eléctrico" v4.x — la misma definida y validada en el
// prototipo (ver diseno-ajustes-visuales-globales.md secciones 6-11).
// No inventar valores nuevos aquí: si hace falta un tono adicional,
// se agrega primero al prototipo y a ese documento, y de ahí se
// traduce a este archivo — una sola fuente de verdad de marca.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class', // documentado en el prototipo, no activado todavía — ver sección 6
  theme: {
    extend: {
      colors: {
        // Los colores de MARCA se leen de variables CSS para que el
        // panel de cada empresa administradora se pinte con el suyo
        // (ver src/lib/branding.ts). El formato `rgb(var(--x) /
        // <alpha-value>)` es el que permite seguir usando opacidades
        // como `bg-royal/10` o `border-royal/50`.
        //
        // Los colores SEMÁNTICOS (ok, warn, danger) NO son
        // personalizables a propósito: el rojo de un error tiene que
        // ser rojo en todas las empresas.
        royal: {
          DEFAULT: 'rgb(var(--royal-rgb) / <alpha-value>)',
          dark: 'rgb(var(--royal-dark-rgb) / <alpha-value>)',
          soft: 'rgb(var(--royal-soft-rgb) / <alpha-value>)',
          line: 'rgb(var(--royal-line-rgb) / <alpha-value>)',
        },
        deep: {
          DEFAULT: 'rgb(var(--deep-rgb) / <alpha-value>)',
          dark: 'rgb(var(--deep-dark-rgb) / <alpha-value>)',
          line: 'rgb(var(--deep-line-rgb) / <alpha-value>)',
        },
        lumen: {
          DEFAULT: 'rgb(var(--lumen-rgb) / <alpha-value>)', // acento "innovación" para IA
          dark: 'rgb(var(--lumen-dark-rgb) / <alpha-value>)',
        },
        info: {
          DEFAULT: '#3B82F6',
          soft: '#EAF0FF',
          line: '#CBDBFF',
        },
        ink: {
          DEFAULT: '#111827',
          2: '#374151',
        },
        muted: '#6B7280',
        paper: '#FFFFFF',
        canvas: '#F8FAFC',
        line: '#E5E7EB',
        ok: { DEFAULT: '#10B981', bg: '#D1FAE5' },
        warn: { DEFAULT: '#F59E0B', bg: '#FEF3C7' },
        danger: { DEFAULT: '#EF4444', bg: '#FEE2E2' },
        // Modo oscuro documentado, no activo — ver sección 6 del changelog
        darkbg: '#0B1220',
        darksurface: '#111827',
        darkline: '#1F2937',
        darktext: '#F9FAFB',
      },
      fontFamily: {
        // Articulat CF — tipografía de la marca. Se carga en
        // src/app/fonts/articulat.ts, que explica qué pesos entran.
        // El respaldo importa: Articulat no trae el símbolo ₡, y esas
        // familias sí lo dibujan.
        sans: ['var(--font-articulat)', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '18px',
      },
      boxShadow: {
        card: '0 2px 6px rgba(15,23,42,.06), 0 14px 34px rgba(63,109,246,.10)',
      },
      backgroundImage: {
        'grad-royal': 'linear-gradient(120deg,#3F6DF6 0%,#315CE8 100%)',
        'grad-hero': 'linear-gradient(120deg,#3F6DF6 0%,#0F172A 100%)',
        'grad-lumen': 'linear-gradient(135deg,#3F6DF6 0%,#5B8CFF 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
