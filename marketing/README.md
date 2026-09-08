# anexypro.com — sitio público

HTML estático. Sin framework y sin dependencias: el único paso de build es
`node build.mjs`, que resuelve los destinos en el marcado.

## Archivos

| Archivo | Qué es |
|---|---|
| `config.json` | **Fuente única** de los destinos: URLs de las plataformas, WhatsApp, teléfono y correos. |
| `index.template.html` | El diseño aprobado, con marcadores `%%CLAVE%%`. Se edita esto, nunca `index.html`. |
| `build.mjs` | Sustituye los marcadores y genera `index.html`, `sitemap.xml` y `robots.txt`. |
| `index.html` | **Generado.** Vercel lo regenera en cada despliegue; se versiona igual, para que el diff muestre lo que se publica y para que un build fallido no deje el sitio sin página. No editarlo a mano: el siguiente build lo sobrescribe. |
| `assets/` | Imágenes, fuentes (Instrument Sans) y JS del diseño. |

## Cambiar una URL o un dato de contacto

Editar `config.json` y desplegar. Vercel ejecuta `build.mjs`
(`vercel.json` › `buildCommand`) y el HTML sale con los valores nuevos.
No hay que tocar `index.template.html`.

Para verlo en local:

```
node build.mjs && python3 -m http.server 8080
```

## Marcadores

`build.mjs` sustituye `%%CLAVE%%` con la entrada correspondiente de
`config.json`, y falla si queda alguno sin resolver o si el marcado usa una
clave que el config no define.

Los correos se sustituyen como cadena desnuda, no solo dentro del `href`:
aparecen también como texto visible en la sección de contacto, y así el enlace
y lo que se lee no pueden quedar desincronizados.

La sintaxis `{{ variable }}` **no** es de este build: la usa el runtime de
diseño (`assets/dc-runtime.js`) para sus bindings — el selector «¿Cuál
necesito?» y el desplegable de acceso a plataformas. No tocarla.

## Regenerar el diseño desde un bundle nuevo

`index.template.html` y `assets/` salen de un archivo «standalone» exportado
del diseño. Si llega una versión nueva, hay que volver a desempaquetarlo:
extraer cada recurso del manifiesto a `assets/`, sustituir los UUID por esas
rutas y rehacer el `<head>` con el SEO de este repositorio (el bundle no lo
trae). El `<head>` actual sirve de referencia.
