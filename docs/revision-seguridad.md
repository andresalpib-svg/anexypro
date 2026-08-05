# Revisión de seguridad antes de producción

Revisión del 31 de julio de 2026 sobre la carpeta activa. Se buscaron
huecos del mismo tipo que el de `public/uploads/`: permisos, datos
expuestos, validaciones y rendimiento.

---

## 1. Las acciones del panel no preguntaban quién las llamaba — **corregido**

### Qué pasaba

Una Server Action de Next.js es un endpoint HTTP. El middleware protege
la **pantalla** `/app/...`; no protege la **acción**. Treinta y cinco
acciones del panel comprobaban únicamente que hubiera una sesión
abierta, y tomaban del formulario el condominio sobre el que iban a
actuar.

Como el condominio viajaba en un campo oculto, bastaba con cambiarlo
desde las herramientas del navegador.

### Demostrado, no supuesto

Con el usuario `supervisor@anexypro.com`, que tiene **un solo**
condominio asignado (Residencial Altamar):

| Paso | Resultado |
| --- | --- |
| La interfaz le ofrece | solo "Residencial Altamar (Demo)" |
| Se cambia el campo oculto a Vista Azul (no asignado) y se envía | **el evento se creó en Vista Azul** |
| Lo mismo, después del arreglo | **el servidor rechaza la operación** |
| Crear un evento en su propio condominio, después del arreglo | sigue funcionando |

Lo que un supervisor podía hacer en condominios que no le asignaron:
dar de alta condominios nuevos, crear unidades, agregar y editar
residentes con sus cédulas y correos, importar el Excel de residentes,
borrar áreas comunes, aprobar o rechazar reservas, registrar visitas,
ingresos y salidas, y crear o eliminar activos y proveedores. El rol
contador —que por diseño no ve residentes ni visitas— alcanzaba lo
mismo.

### Cómo quedó

`src/lib/guard.ts` concentra la decisión:

```ts
const session = await requirePanel({ module: '/app/reservas', condominiumId });
if (!session) return { formError: SIN_PERMISO };
```

`requirePanel` comprueba, en este orden: que haya sesión, que el rol sea
del panel, que el módulo no sea `ownerOnly`, que el contador no salga de
su lista blanca, que el área de permisos esté concedida, y que el
condominio sea uno de los asignados.

**Las reglas no se reescriben ahí**: se leen de `nav-config.ts`, que ya
decide qué ve cada quien en la barra lateral. Así la acción y el menú no
pueden discrepar, que es justamente como se abrió este hueco.

Para las acciones que reciben el identificador de una entidad y no un
condominio, `src/lib/services/entity-scope.ts` resuelve a qué condominio
pertenece esa entidad —área común, reserva, unidad, visita, ingreso,
activo, proveedor, incidente, paquete, ticket, persona— **consultándolo
en la base**, no aceptándolo del formulario. Ese archivo absorbió las
cuatro funciones que ya vivían en `upload-destinations.ts`, que ahora
las reexporta: el mismo dato responde dónde se guarda un archivo y quién
puede tocarlo.

También:

- **Crear condominios** quedó reservado al titular (`requireOwner`), y
  el botón "Nuevo condominio" desapareció para quien ya no puede usarlo:
  la interfaz no debe ofrecer lo que el servidor va a rechazar.
- **El portal de la caseta** (`requireSecurity`) exige el rol
  `seguridad`. Antes, cualquier sesión válida podía consultar por esas
  acciones los residentes y vehículos de una unidad, o marcar paquetes
  como entregados.

`src/lib/__tests__/guard.test.ts` fija estas reglas en nueve pruebas.

---

## 2. Dos fugas de lectura — **corregidas**

**La búsqueda global** (`globalSearch`) recorría condominios, unidades,
documentos, tickets, asambleas y proyectos de **toda la empresa**. Un
supervisor asignado a un condominio encontraba ahí los documentos y las
asambleas de los demás — por la interfaz normal, sin manipular nada.
Ahora recibe la lista de condominios permitidos y es un parámetro
obligatorio, no opcional: quien la llame tiene que decidirlo.

**`assetAccountsAction`** no pedía sesión y recibía el `companyId` por
parámetro: devolvía el plan de cuentas contables de cualquier empresa a
quien conociera su identificador. Ahora toma la empresa de la sesión y
exige rol financiero. No tiene consumidores en el código; se dejó
corregida por si se retoma, pero puede eliminarse.

---

## 3. El aislamiento entre empresas no lo daba la base — **corregido**

### Qué se encontró

`prisma/sql/02_row_level_security.sql` habilita Row-Level Security en 77
tablas y crea 77 políticas. Las políticas existen en la base. **No se
aplican nunca.**

```
usuario de conexión : anexypro
es superusuario     : sí
puede saltarse RLS  : sí
dueño de las tablas : anexypro
tablas con FORCE    : 0 de 77
```

Postgres no aplica RLS al dueño de la tabla salvo que se declare `FORCE
ROW LEVEL SECURITY`, y nunca lo aplica a un superusuario. Se cumplen las
dos condiciones a la vez.

Comprobado creando una segunda empresa de prueba y operando sobre ella
desde el contexto de la primera:

| Prueba | Resultado |
| --- | --- |
| Leer los condominios de la empresa B desde el contexto de A | los ve |
| Modificar una amenidad de B desde el contexto de A | la renombró |
| Borrar una amenidad de B desde el contexto de A | la eliminó |

(La empresa de prueba y sus datos se borraron al terminar.)

### Qué significa y qué no

No es una puerta abierta a internet. Para cruzar empresas hay que estar
autenticado **y** conocer un identificador ajeno, que es un UUID: no se
adivina. El aislamiento real hoy lo da la capa de aplicación, que filtra
por `companyId` en las lecturas.

Lo que sí significa es que **la segunda capa de defensa que el código
documenta no está funcionando**, y que las 55 escrituras del tipo
`update({ where: { id } })` dependen por completo de que ningún
identificador ajeno llegue nunca a ellas.

### Cómo quedó

**1. La aplicación ya no se conecta como dueño ni como superusuario.**
`scripts/crear-rol-app.sql` crea `anexypro_app`: `NOSUPERUSER`,
`NOBYPASSRLS`, sin ser dueño de nada, con permiso para leer y escribir
filas pero no para alterar la estructura. El dueño (`anexypro`) queda
solo para las migraciones, en `DIRECT_URL`. El `datasource` de Prisma
distingue las dos.

**2. `FORCE ROW LEVEL SECURITY` en las 83 tablas con política**
(`prisma/sql/03_rls_endurecido.sql`). Hace falta aunque el rol no sea
superusuario, porque el dueño se salta RLS de todas formas.

**3. Seis tablas que no tenían ninguna política ahora la tienen**:
`admin_tasks` y sus dos tablas hijas, `condominium_supervisors`,
`document_requests` y `document_templates`. Son de datos de cliente —las
solicitudes de documentos llevan congelado el estado financiero de una
filial— y se habían creado después del archivo 02.

**4. Un hallazgo que salió al hacerlo**: `storage_folders` tenía RLS
habilitado **sin ninguna política**. Esa combinación no protege: niega
todo. No se notaba porque el dueño se saltaba RLS, pero al declarar
`FORCE` el repositorio de documentos habría quedado inaccesible por
completo. Venía de aplicar el archivo 02 a mano y a medias. El 03
comprueba esa condición y aborta con un mensaje claro antes de forzar
nada.

**5. Las 53 consultas que iban sin contexto, migradas.** De las 120
iniciales, 53 tocaban tablas con RLS. Ahora son cero. Las que quedan
fuera lo hacen sobre tablas sin política y por un motivo escrito:
`users` y `companies` (el inicio de sesión busca por correo antes de
saber de qué empresa es nadie), `fx_rates`, `service_providers`,
`job_runs` y `storage_settings`.

**6. Lo que legítimamente cruza empresas ahora lo hace empresa por
empresa.** `forEachCompany` (en `src/lib/db.ts`) abre el contexto de
cada una por turno. Lo usan el programador de tareas —que corre sin
sesión— y el panel del master. **No hay una puerta trasera que apague
RLS**: ni un rol con BYPASSRLS ni un valor mágico de contexto. El master
ve la plataforma entera, pero la ve de una empresa a la vez.

**7. El repositorio de documentos abre contextos cortos, uno por
consulta,** en vez de envolver funciones enteras: entre consulta y
consulta hay llamadas al proveedor de archivos, y mantener abierta una
transacción de Postgres mientras se sube un archivo de 100 MB agota el
pool de conexiones.

### El bug que esto destapó

Al pasar al rol restringido, **el inicio de sesión dejó de funcionar
para todos los roles**. La causa: `user.findFirst` traía la ficha de
persona con un `include`, y `persons` sí tiene RLS, así que Postgres
evaluaba la política en el JOIN sin contexto de empresa y abortaba la
consulta. Ahora se busca en dos pasos: primero el usuario, y con su
empresa ya conocida, su persona y las bitácoras.

Vale la pena decir cómo apareció, porque casi se escapa: la primera
prueba dio **57 pantallas "ok"** cuando en realidad las 57 eran la
pantalla de acceso. La prueba solo miraba si había error 500, y un
formulario de login no es un error. Los guiones ahora comprueban que la
sesión exista de verdad (`esPantallaDeAcceso`) y que las pantallas
**muestren datos**, no solo que no revienten.

### Verificación

| Prueba | Antes | Ahora |
| --- | --- | --- |
| Leer condominios de otra empresa desde el contexto propio | los veía | **bloqueado** |
| Modificar una amenidad de otra empresa | la renombró | **bloqueado** |
| Borrar una amenidad de otra empresa | la eliminó | **bloqueado** |
| Consultar sin contexto de empresa | devolvía todo | **0 filas** |
| Conexión de la aplicación | superusuario, dueño | `anexypro_app`, sin privilegios |
| Tablas con RLS forzado | 0 de 77 | **83 de 83** |
| Inicio de sesión, los 5 roles | — | **5/5** |
| Recorrido de 57 pantallas con sesión real | — | **57 bien, 0 rotas** |
| Las pantallas muestran datos | — | **12/12** |
| Supervisor sobre un condominio ajeno | lo creaba | **rechazado** |

(La empresa de prueba y sus datos se borran al terminar cada corrida.)

### Detalle a tener presente

Una consulta sin contexto **devuelve cero filas en vez de fallar**. Es
seguro —no se filtra nada— pero silencioso: si algún día una pantalla
nueva aparece vacía sin motivo, lo primero que hay que mirar es si su
consulta pasa por `withTenantContext`.

---

## 4. Lo que se revisó y está bien

- **El portal del residente.** Deriva todo de la sesión
  (`getResidentContext(session.user.id)`) e ignora lo que mande el
  cliente; para cancelar una visita comprueba que la autorización sea de
  su unidad. Es el patrón correcto, y es el que se replicó en el panel.
- **La descarga de archivos.** `/api/archivo/[id]` exige sesión y
  revalida permisos en cada petición; los enlaces temporales del
  repositorio son tokens HMAC de cinco minutos ligados a un usuario.
- **`/api/cron`.** Si `CRON_SECRET` no está definido, el acceso por
  encabezado queda deshabilitado en vez de quedar abierto.
- **Configuración** (invitar usuarios, permisos del personal, áreas de
  la junta) ya exigía ser el titular.
- **La exportación de reportes** exige el área de Reportes.
- **Las fotos de perfil** solo modifican al usuario de la sesión.

## 5. Rendimiento

No se encontró nada que bloquee la salida a producción. Quedan
anotados, para cuando haya volumen real, quince bucles que consultan la
base por elemento; los que crecen con los datos del cliente son la
importación del Excel de residentes (una consulta por fila) y la
importación del estado bancario (una por movimiento). Hoy son
operaciones puntuales y manuales. Con tres condominios de prueba no hay
forma de medirlo de verdad: conviene revisarlo con datos de un
condominio real cargado por completo.

---

## 6. Estructura de usuarios

Confirmada con Freddy el 31 de julio de 2026:

| Acceso | Rol en el código | Qué puede |
| --- | --- | --- |
| **Master** | `master` | La plataforma entera. **Uno solo**, garantizado por un índice único en la base (`prisma/sql/04_master_unico.sql`) — no basta con el acuerdo, porque el camino real para que aparezca un segundo sería un sembrado o SQL a mano |
| **Administrador** | `admin_owner` | Es el acceso que se le entrega a la empresa que contrata. Crea condominios, crea los supervisores y se los asigna, y ve Finanzas y Contabilidad |
| **Supervisor** | `admin_staff` | Solo los condominios que el Administrador le asigna, y solo las áreas que le habilita |
| **Seguridad** | `seguridad` | La caseta |
| **Condómino** | `condomino` | Su portal |
| **Contador** | `contador` | Se mantiene: acceso restringido para un contador externo — Finanzas, Contabilidad, Reportes y Documentos, nunca residentes ni visitas. El Administrador ya ve contabilidad igual; esto evita darle acceso total a un tercero |

## Cómo volver a comprobarlo

Los guiones quedaron en `.demo-tools/`. `lib-audit.mjs` tiene el inicio
de sesión compartido, que espera la hidratación y reintenta — sin eso
las pruebas miden la pantalla de acceso y todo parece estar bien.

- `audit-login.mjs` — los cinco roles entran.
- `audit-rls-app.mjs` — recorre 57 pantallas con los cinco roles.
- `audit-rls-datos.mjs` — comprueba que las pantallas **muestran datos**,
  no solo que no rompen.
- `audit-escalada.mjs` — el supervisor intenta actuar en un condominio
  ajeno. Debe fallar.
- `audit-regresion.mjs` — confirma que el guard no estorba a quien sí
  tiene permiso.

Y para el aislamiento en la base, `prisma/sql/03_rls_endurecido.sql` se
puede reaplicar cuando se quiera: es idempotente y aborta si encuentra
una tabla con RLS sin política o sin `FORCE`.
