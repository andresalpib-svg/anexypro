/** @type {import('next').NextConfig} */
const nextConfig = {
  // Carpeta de compilación.
  //
  // POR QUÉ ES CONFIGURABLE: `next dev` y `next start` escriben los dos
  // en `.next`. Si se corren a la vez sobre esta misma carpeta —cosa
  // normal mientras se prueba una versión compilada sin dejar de
  // programar—, el servidor de desarrollo BORRA y reescribe los
  // fragmentos que la compilación de producción está sirviendo. El
  // navegador pide entonces un archivo que ya no existe, recibe un 400,
  // y como el fallo ocurre al montar la raíz, la aplicación entera se
  // cae con "No pudimos cargar ANEXYpro". Pasó de verdad: el 6/8 el
  // servidor de producción del puerto 3101 quedó inservible por esto.
  //
  // Con `NEXT_DIST_DIR` cada modo tiene su carpeta y dejan de pisarse.
  // En Vercel la variable no está definida, así que sigue siendo
  // `.next` y nada cambia allá.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    serverActions: {
      // Coherente con `MEDIA_MAX_BYTES` (100 MB) de src/lib/upload.ts.
      //
      // Estaba en 10 MB mientras el código anunciaba límites de 100 MB
      // (videos de comunicados), 25 MB (evidencias de incumplimientos)
      // y 20 MB (extractos bancarios): todo lo que pasara de 10 MB
      // moría en el runtime de Next con un error opaco, y los mensajes
      // cuidados del código eran inalcanzables.
      //
      // OJO CON EL HOSTING: en Vercel, una función serverless no acepta
      // cuerpos de más de ~4,5 MB, y esto no lo cambia. Es decir, los
      // videos y los archivos grandes NO se van a poder subir por una
      // server action estando en Vercel, por mucho que el código lo
      // permita. Para eso hace falta subir directamente al proveedor de
      // almacenamiento, que es trabajo aparte y está anotado como
      // pendiente en el informe de auditoría.
      bodySizeLimit: '100mb',
    },
  },
  images: {
    remotePatterns: [],
  },

  /**
   * Una sola puerta de entrada.
   *
   * El proyecto responde por dos direcciones: el dominio propio
   * (api.anexypro.com) y el alias que da Vercel (anexypro.vercel.app).
   * Eso no es solo cosmético: `NEXTAUTH_URL` apunta al dominio propio,
   * así que entrando por el alias la sesión se intentaba establecer en
   * OTRO dominio — la cookie no quedaba donde estaba el usuario y
   * navegar terminaba en redirecciones y pantallas de error.
   *
   * DETALLES DELIBERADOS:
   *
   * - Es TEMPORAL (307), no permanente. Un 308 se queda cacheado en el
   *   navegador y, si algún día hubiera que volver atrás, habría que
   *   perseguir la caché de cada usuario. Ante la duda, reversible.
   * - Solo el alias EXACTO. Las direcciones de cada despliegue
   *   (anexypro-<hash>-arruzab.vercel.app) no se tocan, porque son las
   *   que se usan para probar una versión antes de publicarla.
   * - El 307 conserva método y cuerpo, así que tampoco rompe una
   *   petición POST que llegue por el alias.
   */
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'anexypro.vercel.app' }],
        destination: 'https://api.anexypro.com/:path*',
        permanent: false,
      },
    ];
  },

  /**
   * Headers de seguridad, en todas las rutas.
   *
   * Antes no había ninguno (auditoría de seguridad 2026-08-11, hallazgo
   * #18): sin `frame-ancestors`/`X-Frame-Options`, ANEXYpro se podía
   * embeber en un `<iframe>` de un sitio ajeno — clickjacking sobre,
   * por ejemplo, la aprobación de un gasto o un cambio de
   * configuración.
   *
   * DELIBERADAMENTE NO se agrega una Content-Security-Policy completa
   * (script-src/style-src): la aplicación usa `style={{...}}` inline en
   * decenas de componentes (color de marca del condominio, barras de
   * progreso, etc.) y bloquear estilos inline sin una revisión
   * pantalla por pantalla podría romper la interfaz en producción sin
   * forma de probarlo todo de antemano. `frame-ancestors 'none'` no
   * tiene ese riesgo: solo impide que OTRA página nos incruste, no
   * cambia nada de cómo se renderiza esta.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Redundante con X-Frame-Options a propósito: es el
          // reemplazo moderno (soporta más casos, como subdominios
          // específicos si algún día hicieran falta) pero un navegador
          // viejo que no entienda `frame-ancestors` en la CSP todavía
          // respeta el header clásico.
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
