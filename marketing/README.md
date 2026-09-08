# anexypro.com — sitio público

HTML estático. Sin framework y sin dependencias: el único paso de build es
`node build.mjs`, que resuelve los destinos en el marcado.

## Archivos

| Archivo | Qué es |
|---|---|
| `config.json` | **Fuente única** de los destinos: URLs de las plataformas, WhatsApp, correo. |
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

La sintaxis `{{ variable }}` **no** es de este build: la usa el runtime de
diseño (`assets/dc-runtime.js`) para los bindings del selector interactivo de
la sección «¿Qué necesita su condominio?». No tocarla.

## Regenerar el diseño desde un bundle nuevo

`index.template.html` y `assets/` salen de un archivo «standalone» exportado
del diseño. Si llega una versión nueva, hay que volver a desempaquetarlo:
extraer cada recurso del manifiesto a `assets/`, sustituir los UUID por esas
rutas y rehacer el `<head>` con el SEO de este repositorio (el bundle no lo
trae). El `<head>` actual sirve de referencia.
