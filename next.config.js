/** @type {import('next').NextConfig} */
const nextConfig = {
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
};

module.exports = nextConfig;
