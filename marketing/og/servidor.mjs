/**
 * Generador de og-image.png — la tarjeta que se ve al pegar el enlace en
 * WhatsApp, Facebook o Slack.
 *
 *   node og/servidor.mjs      y abrir http://localhost:4330
 *
 * La página se dibuja sola y hace POST del PNG, que se guarda en
 * marketing/og-image.png. Después hay que subir OG_VERSION en config.json:
 * esas plataformas cachean la tarjeta por URL y sin el ?v= nuevo seguirían
 * mostrando la anterior.
 *
 * Se dibuja en el navegador, y no con una librería de imagen, porque así el
 * texto lo compone el mismo motor que la web: Instrument Sans es una fuente
 * variable en woff2 y los rasterizadores de SVG del sistema no la instancian
 * bien (fontkit devuelve la instancia vacía, y librsvg la sustituye por otra
 * tipografía sin avisar).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.dirname(new URL(import.meta.url).pathname);
const MARKETING = path.join(RAIZ, '..');
const SALIDA = path.join(MARKETING, 'og-image.png');
const MIME = { '.html':'text/html; charset=utf-8', '.png':'image/png', '.woff2':'font/woff2' };

// Opcional: si hay sharp a mano, se recomprime con paleta — baja de ~180 KB a
// ~40 KB sin diferencia visible, y una tarjeta liviana es una tarjeta que
// WhatsApp muestra. Sin sharp se guarda tal cual, que también sirve.
async function comprimir(buf) {
  try {
    const { createRequire } = await import('node:module');
    const sharp = createRequire(import.meta.url)('sharp');
    return await sharp(buf).png({ compressionLevel: 9, palette: true, effort: 10 }).toBuffer();
  } catch {
    console.warn('[aviso] sin sharp: se guarda el PNG del navegador, más pesado');
    return buf;
  }
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/guardar') {
    const trozos = [];
    req.on('data', c => trozos.push(c));
    req.on('end', async () => {
      const buf = await comprimir(Buffer.concat(trozos));
      fs.writeFileSync(SALIDA, buf);
      console.log(`[listo] og-image.png — ${(buf.length / 1024).toFixed(1)} KB`);
      console.log('        subí OG_VERSION en config.json para invalidar el caché de las plataformas');
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }).end('ok');
    });
    return;
  }
  const url = req.url.split('?')[0];
  const archivo = url.startsWith('/assets/')
    ? path.join(MARKETING, 'assets', url.slice('/assets/'.length))
    : path.join(RAIZ, url === '/' ? 'tarjeta.html' : url);
  if (!archivo.startsWith(MARKETING) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
    res.writeHead(404).end('no'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(archivo)] || 'application/octet-stream' });
  fs.createReadStream(archivo).pipe(res);
}).listen(4330, () => console.log('generador de la tarjeta: http://localhost:4330'));
