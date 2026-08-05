# Tipografía y marca

## La marca

`AnexyPRO` — "Anexy" en el color contrario al fondo, "PRO" en azul `#3B6EF5`. Sin símbolo: la versión anterior llevaba una hoja a la izquierda del texto y la marca nueva no.

Vive en un solo archivo, [`src/components/ui/logo.tsx`](../src/components/ui/logo.tsx). Antes estaba escrita a mano en seis lugares —las tres barras laterales, la cabecera del panel master, el login y su pantalla de respaldo—, así que cambiarla obligaba a encontrar y editar los seis y bastaba olvidar uno para que la aplicación mostrara dos logotipos distintos.

Dos tonos:

| Tono | Para | "Anexy" |
| --- | --- | --- |
| `claro` (por defecto) | fondos oscuros: barras laterales, login | blanco |
| `oscuro` | fondos claros | color de texto de la app |

Tamaños en uso: `text-4xl` en el login —es la primera pantalla y ahí la marca no compite con nada— y `text-xl` en las barras laterales y la cabecera del master, donde convive con la navegación.

**El logotipo es texto, no el archivo vectorial original.** Reproduce el lockup con la tipografía de la marca. Para usar el `.svg` del diseñador, se reemplaza el contenido de `Logo` por un `<img>` a `/anexypro.svg` y `/anexypro-blanco.svg`. Es el único archivo que hay que tocar.

---

## Articulat CF

Tipografía de la marca, en reemplazo de Geist, que era la elección provisional mientras no había una definida. Se carga en [`src/app/fonts/articulat.ts`](../src/app/fonts/articulat.ts) con `next/font/local`, que la sirve desde el mismo dominio, la precarga y le pone `font-display: swap`.

### Qué pesos entran, y por qué solo esos

La familia trae diecisiete pesos más sus oblicuas. La aplicación usa cinco:

| Peso | Archivo | Usos en el código |
| --- | --- | --- |
| 400 | `ArticulatCF-Normal` | texto corrido (por defecto) |
| 500 | `ArticulatCF-Medium` | 132 |
| 600 | `ArticulatCF-DemiBold` | 130 |
| 700 | `ArticulatCF-Bold` | 225 |
| 800 | `ArticulatCF-ExtraBold` | 15 |

Cargar los diecisiete serían 675 KB que el navegador descarga y nunca dibuja. Estos cinco, convertidos de `.ttf` a `.woff2` —mismo dibujo, un cuarto del peso— suman **176 KB**.

**No se incluyen las oblicuas:** ninguna pantalla usa `italic`. Si algún día se usa, el navegador la sintetiza inclinando el peso recto. Para la oblicua real se agregan los archivos `*Oblique` con `style: 'italic'`.

Los originales del zip (`.otf` y `.ttf`, los diecisiete pesos) quedan **fuera del repositorio**. Si se necesita otro peso, se convierte desde ahí.

### Articulat CF no trae el símbolo de colón (₡)

Comprobado en la tabla de caracteres de la fuente: `U+20A1` no está entre sus 441 glifos. La aplicación muestra montos en colones en diez archivos, así que **el símbolo aparece dibujado por la siguiente familia de la lista de respaldo** (`Inter`, `system-ui`), con un trazo levemente distinto al de las cifras que lo siguen.

No es un error de configuración: es la cobertura de la tipografía. Por eso el respaldo en `tailwind.config.ts` importa y no debe quedar solo en `sans-serif`.

Si la diferencia molesta, las salidas posibles son: pedirle al diseñador el glifo y agregarlo a la fuente, escribir `CRC` en vez de `₡` en los montos, o dejarlo como está.

### Lo que sigue en Helvetica

El informe PDF de caja chica ([`informe-caja-chica/route.ts`](../src/app/app/mantenimiento/informe-caja-chica/route.ts)) usa las fuentes estándar de pdf-lib. Incrustar Articulat ahí requiere `@pdf-lib/fontkit` y suma ~135 KB al PDF; tampoco resolvería el ₡, que ese informe ya evita rotulando la moneda como `CRC`.

El correo ([`email.ts`](../src/lib/email.ts)) usa una pila de fuentes del sistema. Es lo correcto: la mayoría de los clientes de correo no cargan tipografías web.

### Licencia

Articulat CF es una tipografía comercial de Connary Fagen. Servirla desde `anexypro.com` requiere licencia de fuente web, distinta de la de escritorio. Conviene confirmar que la licencia adquirida la cubre antes de desplegar.


---

## La portada del inicio de sesión

`public/login-blueprint.svg` — el plano de áreas comunes que ocupa el
panel izquierdo del login.

Venía en JPEG de 817 × 1285 px y 241 KB. El problema no era el peso sino
la naturaleza del archivo: **es un dibujo de líneas — solo el 1,8 % de
sus píxeles eran trazo** sobre un fondo plano `#091324`. Eso es justo lo
que peor comprime el JPEG, que está pensado para fotografías: cada línea
blanca de un píxel sobre azul oscuro arrastraba ruido de compresión a su
alrededor.

Y encima se ampliaba. El panel ocupa el 46 % del ancho de la pantalla:
en un monitor de 1440 px con densidad doble, el navegador tiene que
dibujar unos 1325 px reales a partir de una imagen de 817. No había
resolución que rescatar — el archivo original que Freddy aprobó es de
817 px y no existe una versión mayor.

**Se redibujó en vector.** No es un reescalado: un aumento interpola
píxeles que no existen y solo consigue emborronar con más suavidad. El
SVG se dibuja nítido a 817, a 1920 y a 5K, pesa **17 KB en vez de 241**,
y los rótulos son texto de verdad.

Detalles que conviene saber si hay que retocarlo:

- **Un solo color.** Todo el dibujo hereda `currentColor` del grupo
  raíz: cambiar el trazo es cambiar un atributo.
- **La vegetación tiene el borde festoneado**, no radios rectos. En los
  planos arquitectónicos el follaje se dibuja así, y es lo que le da
  carácter a la zona ajardinada. Hay dos variantes de árbol para que un
  grupo no parezca un sello repetido.
- **El automóvil está dibujado en vertical** en su símbolo. Rotarlo con
  `transform` lo sacaba de la plaza de parqueo.
- El JPEG original se conserva en `public/login-blueprint.jpg` por si
  hiciera falta volver a él.

Lo que el vector no reproduce: el follaje del original está dibujado a
mano, con una irregularidad que un símbolo repetido no iguala. Se ganó
nitidez y se perdió algo de esa textura orgánica.


---

## Vidrio líquido — la pantalla de acceso

Rediseño de agosto de 2026, tomando como referencia una pantalla de una
sola columna centrada, con campos de línea inferior y mucho aire.

**Qué la compone**, de atrás hacia adelante:

1. **Masas de color** (`.liquid-blob`) que derivan en ciclos de 26 y 34
   segundos. Son `filter: blur()` sobre elementos grandes, no imágenes:
   pesan cero, se adaptan a cualquier pantalla y toman el color de la
   marca de la empresa.
2. **El plano del condominio** como textura del borde, con una máscara
   radial que lo desvanece hacia el centro. En la primera versión
   ocupaba toda la pantalla y sus rótulos competían con los campos.
3. **Una viñeta profunda.** Es lo que hace que el vidrio se vea vidrio:
   sin fondo oscuro alrededor, una lámina translúcida sobre azul medio
   no se distingue del azul. Fue el ajuste que más cambió el resultado.
4. **La lámina** (`.liquid-glass`): `backdrop-filter: blur(28px)
   saturate(180%)`, con el borde claro arriba y oscuro abajo. Esa
   asimetría es la que da la lectura de grosor; sin ella se ve un
   rectángulo translúcido, no una lámina.
5. **Un reflejo especular** que recorre el borde (`.liquid-sheen`), con
   una máscara `xor` para que solo pinte el contorno.

Todo sale de las variables de marca (`--royal-rgb`, `--lumen-rgb`), así
que una empresa con identidad propia ve su propio degradado sin tocar
una línea de esto.

**`prefers-reduced-motion` detiene las tres animaciones.** Un fondo que
se mueve sin parar es un problema real para quien lo pidió.

### Detalles que costaron

- El **autocompletado de Chrome** pinta un fondo blanco sólido que rompe
  el vidrio. Se neutraliza con una sombra interior transparente y una
  transición de 9999 s, que es el truco conocido para desactivarlo.
- Los campos usan **línea inferior y no recuadro**: con solo dos campos,
  el recuadro es más tinta de la necesaria y la mirada se va a la caja
  en vez de al texto.

### Un hallazgo del camino

Al probar el acceso tras el rediseño, dos cuentas fallaban siempre.
No era el diseño: estaban con estado `bloqueado` en la base. Lo que sí
era un problema es que **el login decía "correo o contraseña
incorrectos" en los dos casos**, y eso manda a quien tiene el acceso
suspendido a intentar restablecer la contraseña una y otra vez en vez de
llamar a quien puede reactivarlo. El mensaje ahora cubre ambos motivos.
