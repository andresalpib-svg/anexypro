/**
 * Genera index.html a partir de index.template.html + config.json.
 *
 * El sitio es HTML estático: no hay framework ni dependencias. Este paso
 * existe solo para que las URLs de las plataformas y los datos de contacto
 * vivan en UN archivo (config.json) en vez de repetidos por el marcado, y
 * para que el HTML publicado los lleve ya resueltos — así los enlaces
 * funcionan sin JavaScript y los rastreadores los ven.
 *
 * Vercel lo ejecuta en cada despliegue (marketing/vercel.json › buildCommand).
 */
import fs from 'node:fs';
import path from 'node:path';

const aqui = path.dirname(new URL(import.meta.url).pathname);
const config = JSON.parse(fs.readFileSync(path.join(aqui, 'config.json'), 'utf8'));
const plantilla = fs.readFileSync(path.join(aqui, 'index.template.html'), 'utf8');

let html = plantilla.replace(/%%([A-Z_]+)%%/g, (todo, clave) => {
  if (!(clave in config)) throw new Error(`config.json no define ${clave} (usado en index.template.html)`);
  return config[clave];
});

// Un marcador sin sustituir se publicaría como texto literal en la página.
// Solo %%CLAVE%%: el runtime de diseño usa {{ ... }} para sus propios bindings.
const sobrantes = html.match(/%%[A-Z_]+%%/g);
if (sobrantes) throw new Error(`Marcadores sin resolver: ${[...new Set(sobrantes)].join(', ')}`);

fs.writeFileSync(path.join(aqui, 'index.html'), html);

// sitemap.xml comparte el dominio canónico con el HTML — se genera del mismo
// config para que no puedan discrepar.
const hoy = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(aqui, 'sitemap.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${config.SITE_URL}/</loc>
    <lastmod>${hoy}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`);

fs.writeFileSync(path.join(aqui, 'robots.txt'),
`User-agent: *
Allow: /

Sitemap: ${config.SITE_URL}/sitemap.xml
`);

console.log(`index.html generado (${(html.length / 1024).toFixed(1)} KB) · canónico ${config.SITE_URL}`);
