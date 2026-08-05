# Panel master

El master es el dueño de la plataforma: da de alta a las empresas
administradoras que contratan el servicio, atiende a cualquier usuario
que pierde el acceso y define cómo se ve el panel de cada cliente.

Es **uno solo** — garantizado por un índice único en la base, no por
acuerdo (`prisma/sql/04_master_unico.sql`).

---

## Alta de un cliente

`/master/empresas` → **Nueva empresa**.

Un solo formulario crea la empresa y su primer administrador, en una
transacción. Van juntos a propósito: una empresa sin administrador no le
sirve a nadie —nadie podría entrar a configurarla— y dejarla a medias
obligaría a recordar el segundo paso.

Al terminar, la pantalla muestra el usuario y la contraseña **una sola
vez**, con un botón de copiar y el aviso correspondiente. La contraseña
no se guarda en claro en ninguna parte: si se cierra la ventana sin
anotarla, hay que restablecerla.

Si no se escribe contraseña se genera una. Es legible al dictado: sin
`l/1/I` ni `O/0`, porque en la práctica se entrega por teléfono.

Desde la ficha de cada empresa se pueden agregar más administradores.

---

## Auxiliar a un usuario

`/master/usuarios` — todos los usuarios de todas las empresas, con
buscador por nombre o correo y filtros por empresa, rol y estado.

Tres acciones por usuario:

- **Ver la información.** Empresa, rol, estado, teléfono, último ingreso,
  condominios que supervisa, su ficha de residente si la tiene, y **los
  últimos diez intentos de acceso**. Eso último es lo que resuelve la
  llamada: si hay intentos fallidos, el usuario existe y se equivoca de
  contraseña; si no hay ninguno, ni siquiera está llegando al sistema.
- **Restablecer la contraseña.** Genera una nueva, la muestra una vez y
  reactiva la cuenta. Queda registrada la gestión en la bitácora de la
  empresa afectada — nunca la contraseña.
- **Bloquear o reactivar el acceso.**

El usuario master no se puede bloquear ni restablecer a sí mismo desde
aquí: sería la forma más rápida de quedarse fuera de la plataforma.

---

## Identidad visual por empresa

Cada empresa puede tener su color, y el panel de sus usuarios se pinta
con él — incluido el portal del residente y la caseta de seguridad.

De **un solo color** se derivan los cuatro tonos que usa la interfaz —el
normal, el oscuro del estado activo, el suave de los fondos y el de los
bordes— para que el master elija uno y no cuatro, y para que la relación
entre ellos sea siempre la misma (`src/lib/branding.ts`).

**Los colores semánticos no se personalizan.** El verde de éxito, el
ámbar de aviso y el rojo de error quedan fijos a propósito: el rojo de un
error tiene que ser rojo en todas las empresas.

La pantalla avisa si el color elegido no contrasta con el blanco. El
umbral es **3:1**, no 4,5:1, porque el color se usa en botones y
distintivos —texto de 14 px en seminegrita, que WCAG clasifica como texto
grande—. Con el umbral de texto pequeño, el propio azul de ANEXYpro
(3,6:1) se rechazaría a sí mismo.

### Cómo funciona por dentro

Los colores de marca de `tailwind.config.ts` pasaron de valores fijos a
`rgb(var(--royal-rgb) / <alpha-value>)`. Ese formato —y no `var(--royal)`
a secas— es el que permite seguir usando opacidades como `bg-royal/10` o
`border-royal/50`, que el código ya usaba en varios sitios.

El layout inyecta las variables en el `style` del contenedor raíz. Si la
empresa no tiene marca propia, `brandStyle` devuelve un objeto vacío y el
panel se queda con la paleta de `globals.css` — la paleta por defecto no
está duplicada en dos lugares.

---

## Cambio de contraseña

`Mi Perfil`, en el panel y en el portal del residente.

Existe porque sin esto una contraseña restablecida por el master se queda
como definitiva: quien la recibe no tendría forma de sustituirla por una
suya.

Pide la contraseña actual a propósito. Una sesión abierta y olvidada en
una computadora compartida no debería bastar para dejar fuera al dueño de
la cuenta.

---

## Verificación

`.demo-tools/audit-master.mjs`, contra la aplicación real:

| Comprobación | Resultado |
| --- | --- |
| Alta de empresa con su administrador | ✓ |
| Credenciales mostradas una vez | ✓ |
| El usuario aparece en el buscador de la plataforma | ✓ |
| La ficha muestra empresa y accesos | ✓ |
| El administrador creado entra con esa contraseña | ✓ |
| Su panel usa el color de su empresa | ✓ |
| No ve datos de otras empresas | ✓ |
| Puede cambiar su contraseña | ✓ |

(La empresa de prueba se elimina al terminar, incluida su bitácora.)

---

## Un tropiezo del entorno que conviene recordar

Al añadir campos nuevos al esquema, **el servidor de desarrollo se queda
con el cliente de Prisma viejo en memoria**. El alta de empresa falló con
un error de argumento desconocido hasta reiniciarlo. Es el mismo
tropiezo que ya estaba anotado para `prisma generate`: si el servidor
estaba corriendo, hay que reiniciarlo.
