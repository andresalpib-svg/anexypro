/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // adjuntos de tickets/incidentes/documentos vía base64
    },
  },
  images: {
    remotePatterns: [],
  },
};

module.exports = nextConfig;
