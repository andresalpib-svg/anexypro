# Repositorio de documentos — arquitectura

Fecha: 27 de julio de 2026

## La regla que sostiene todo

```
Módulos del sistema
        ↓  (solo esta puerta)
services/storage.ts          ← permisos, metadatos, árbol de carpetas
        ↓
StorageProvider (interfaz)   ← src/lib/storage/provider.ts
        ↓
┌───────────────┬────────────────┬──────────────────────┐
│ Google Drive  │ Servidor local │ S3 · GCS · R2 · Azure│
│ implementado  │ implementado   │ declarados           │
└───────────────┴────────────────┴──────────────────────┘
```

Ningún módulo de ANEXYpro conoce el proveedor. Ni una sola línea fuera de `src/lib/storage/` menciona Google Drive. **Migrar es implementar la interfaz una vez más y cambiar la configuración.**

## Archivos

| Archivo | Qué hace |
|---|---|
| `src/lib/storage/provider.ts` | La interfaz. 11 métodos. El contrato. |
| `src/lib/storage/local-provider.ts` | Proveedor local, en `storage/` **fuera de `public/`**. Funciona hoy. |
| `src/lib/storage/google-drive-provider.ts` | Drive por API REST v3 + cuenta de servicio. Todo Drive vive acá. |
| `src/lib/storage/index.ts` | Fábrica. El único lugar que sabe qué proveedores existen. |
| `src/lib/storage/tree.ts` | El árbol de carpetas de cada condominio. |
| `src/lib/storage/permissions.ts` | Reglas de acceso por rol. Lógica pura, 22 pruebas. |
| `src/lib/services/storage.ts` | Cara visible: subir, leer, mover, buscar, crear árbol. |
| `src/lib/services/storage-links.ts` | Enlaces temporales firmados. 8 pruebas. |
| `src/app/api/documentos/[token]/route.ts` | La única salida de bytes del repositorio. |

## Por qué Drive va por REST y no por el SDK

Son cuatro llamadas HTTP. El paquete `googleapis` pesa decenas de megabytes y arrastra dependencias que hay que mantener. La autenticación de cuenta de servicio es un JWT firmado con RS256, que Node hace de forma nativa. Menos superficie que auditar en el componente que maneja documentos privados de condóminos.

## La base de datos no guarda rutas ni URLs

`StorageObject` guarda exactamente lo pedido: proveedor, identificador del proveedor, nombre, tipo, tamaño, fechas, dueño, condominio, huella SHA-256 y estado. Nada más.

El identificador del proveedor es **opaco**: el sistema lo guarda y lo devuelve, pero nunca lo interpreta ni lo construye. Por eso funciona igual siendo un id de Drive, una llave de S3 o una ruta local.

**Durante una migración conviven dos proveedores.** Cada archivo recuerda con cuál se guardó, y se lee con ese — no con el activo. Por eso cambiar de proveedor no rompe lo ya guardado.

## Enlaces temporales: por qué no se usa una URL prefirmada del proveedor

Una URL prefirmada de S3 o de Drive **revela dónde vive el archivo**: el bucket, el identificador, la cuenta. El requisito es que el usuario nunca conozca la ubicación real.

En su lugar ANEXYpro emite un enlace hacia su propia ruta:

```
/api/documentos/<token firmado>
```

El token es autocontenido y firmado con HMAC-SHA256 (no se guarda en la base, así que emitir un enlace no cuesta una escritura). Lleva: objeto, usuario, vencimiento y modo. Al usarse, la ruta verifica **tres** cosas:

1. El enlace es auténtico y no venció.
2. Hay sesión y es el mismo usuario al que se le emitió.
3. Ese usuario **todavía** tiene permiso sobre la carpeta.

El punto 3 es el que importa: los permisos se vuelven a verificar en el momento de la descarga. Si al usuario le revocaron el acceso hace un minuto, el enlace deja de servir aunque no haya vencido.

Ventaja adicional: cambiar de proveedor no cambia ninguna URL, porque las URLs nunca apuntaron al proveedor.

### Verificación

| Caso | Resultado |
|---|---|
| Enlace válido, usuario correcto | 200, entrega el archivo |
| Enlace emitido para otro usuario | 403 |
| Enlace vencido | 403 |
| Enlace alterado (firma de otro) | 403 |
| Firma inventada | 403 |
| Sin sesión iniciada | 307 al login, el archivo no sale |
| Acceso directo a la ruta en disco | 404 |

Encabezados de la respuesta: `Cache-Control: private, no-store` y `X-Content-Type-Options: nosniff`.

## Estructura de carpetas

```
ANEXYpro/
  Condominios/
    <Nombre del Condominio>/
      Administración/ Actas · Asambleas · Estados de Cuenta · Comunicados · Reglamentos
      Contratos/ Proveedores · Mantenimiento
      Facturas/ Cobros · Reportes
      Incumplimientos/
      Junta Directiva/
      Residentes/ <una carpeta por condómino>
      Seguridad/ Reservas · Visitas
      Multimedia/ Fotografías · Logos
      Documentos Temporales/
      Otros/
      Respaldos/
```

**Incumplimientos** (2026-08-05) guarda los PDF y la evidencia del módulo de
incumplimientos — antes iban a Comunicados y Fotografías. No se expone a la
junta ni al contador, igual que el módulo. **Otros** es el cajón para lo que
no calza en ninguna sección.

**Interpretación de la lista original.** La lista venía con nombres claramente subordinados a otros (Actas y Asambleas bajo Administración, Proveedores y Mantenimiento bajo Contratos, y así). Se implementó con esa jerarquía porque es la que hace navegable el repositorio. Si alguna debe ir al primer nivel, se cambia en `tree.ts` y el árbol se reconstruye **sin perder archivos**: las carpetas se identifican por su ruta lógica (`slug`), no por su posición.

### Creación automática

- **Al crear un condominio** se construye el árbol completo (23 carpetas).
- **Al registrar una persona** se crea su carpeta individual.

Las dos operaciones son **idempotentes** y ocurren **fuera de la transacción**, con el error registrado pero no propagado: si el proveedor está caído, eso no debe impedir crear un condominio ni registrar a un residente. El botón «Verificar carpetas» reconstruye lo que falte.

El nombre visible de la carpeta de un residente es su nombre, pero el `slug` usa su identificador: si mañana se corrige el nombre, la carpeta sigue siendo la misma y no se duplica.

## Permisos

| | Master | Admin | Supervisor | Contador | Junta | Seguridad | Residente |
|---|---|---|---|---|---|---|---|
| Todo el repositorio | ✅ | — | — | — | — | — | — |
| Solo su empresa | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Solo condominios asignados | — | — | ✅ | — | — | — | — |
| Administración, Facturas | ✅ | ✅ | ✅ | ✅ lectura | parcial | ❌ | ❌ |
| Actas, Asambleas, Contratos | ✅ | ✅ | ✅ | ✅ | ✅ lectura | ❌ | ❌ |
| Seguridad/ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ escribe | ❌ |
| Respaldos | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Su propia carpeta | ✅ | ✅ | ✅ si asignado | ✅ | ❌ | ❌ | ✅ lectura |
| Carpeta de otro residente | ✅ | ✅ | ✅ si asignado | ✅ | ❌ | ❌ | **❌ nunca** |

Reglas de fondo:

- **Si no está permitido explícitamente, se niega.** Una carpeta sin roles autorizados no la abre nadie salvo el master.
- **Leer y escribir no son lo mismo.** La junta consulta actas pero no las sube. El residente consulta sus documentos pero no deposita nada: es la administración la que le entrega.
- **Eliminar es más estricto que escribir.** El supervisor puede subir documentos pero no borrarlos.
- El rol `junta_directiva` **no basta**: además hay que ser miembro real registrado.

## Configuración

Pantalla master → **Almacenamiento**. Muestra los seis proveedores, cuáles están implementados, cuántos archivos hay en cada uno, y permite probar la conexión antes de activar.

**Un proveedor no se activa sin pasar la prueba de conexión.** Dejar activo uno que no responde rompería la subida de documentos en toda la plataforma.

Para Google Drive:

1. Cuenta de servicio en Google Cloud con la API de Drive habilitada.
2. `GOOGLE_DRIVE_CLIENT_EMAIL` y `GOOGLE_DRIVE_PRIVATE_KEY` en el entorno.
3. Compartir la carpeta raíz con ese correo, o usar una unidad compartida y definir `GOOGLE_DRIVE_SHARED_DRIVE_ID`.
4. Probar la conexión y recién entonces activar.

> **Recomendación:** usar unidad compartida. Sin ella los archivos cuentan contra la cuota de la cuenta de servicio, que es pequeña y no se puede ampliar.

## Escalabilidad

- Los identificadores del proveedor están indexados; no hay recorrido de árbol para localizar un archivo.
- El árbol se lee de la base, no del proveedor: listar carpetas no cuesta llamadas externas.
- La huella SHA-256 evita guardar dos veces los mismos bytes en la misma carpeta.
- El aislamiento multi-inquilino está en la base (RLS) además de en la aplicación.

## Cómo agregar Amazon S3 (o cualquier otro)

1. Crear `src/lib/storage/s3-provider.ts` que implemente `StorageProvider`.
2. En `src/lib/storage/index.ts`: importarlo, agregar el `case 's3'` y sumar `'s3'` a `IMPLEMENTED`.
3. Activarlo desde la pantalla master.

**No se toca nada más.** Ni un módulo, ni una pantalla, ni una URL.

---

## La carpeta pública: cómo se cerró

Hasta esta migración, las subidas del sistema —comprobantes de pago, facturas de caja chica, adjuntos de tareas, fotos de perfil y de visitantes, normativas de amenidades— pasaban por `saveUpload`, que escribía en `public/uploads/` y guardaba en la base una URL pública. **Cualquiera con la URL veía el archivo, sin sesión y sin verificar permisos.**

### Qué se hizo

**1. Una referencia interna en vez de una URL pública.** `saveToRepository` (`src/lib/services/file-refs.ts`) reemplazó a `saveUpload` en los 21 puntos de subida. Guarda en el repositorio privado y devuelve `/api/archivo/<objectId>`.

Se eligió esa forma a propósito: las 34 columnas del esquema que guardaban `/uploads/...` y los ~50 componentes que ya renderizaban `<a href>` o `<img src>` con ese valor siguen funcionando sin cambios. La alternativa —columnas nuevas de tipo `objectId` más un componente propio— habría sido un cambio mucho mayor sin ganar seguridad.

No es una "URL permanente" en el sentido problemático: por sí sola no da acceso a nada. Es un identificador opaco, y la ruta a la que apunta (`src/app/api/archivo/[id]/route.ts`) exige sesión y **vuelve a verificar los permisos de la carpeta en cada petición**. Si a un residente le quitan el acceso, el enlace que ya tenía deja de servir de inmediato.

**2. Los archivos que ya existían se movieron.** `scripts/migrar-subidas-publicas.ts` recorre cada columna que guarda `/uploads/...`, lee el archivo del disco, lo sube a la carpeta que le corresponde en el repositorio —las mismas carpetas que usan hoy los módulos, para que lo antiguo y lo nuevo queden juntos— reescribe la columna y borra el archivo físico. Es idempotente y acepta `--dry`.

Recién borra de `public/` al final: si algo falla, el archivo sigue ahí y la corrida se repite.

**3. `saveUpload` se eliminó, no se depreció.** Mientras la función exista, cualquier módulo nuevo puede volver a exponer archivos sin darse cuenta. Que la compilación falle es la garantía.

**4. El sembrado de demostración también dejó de escribir en `public/`.** Si no, cada `db:seed` volvía a abrir el hueco.

**5. El informe PDF de caja chica lee del repositorio.** Antes abría la factura con `fs.readFile` sobre `public/uploads`; ahora pasa por `readObject`, que verifica permisos — el informe no puede incrustar una factura que quien lo descarga no tendría derecho a ver.

### Verificación

Con navegador real (`.demo-tools/verify-privados.mjs` y `verify-privados2.mjs`), contra los datos reales:

| Comprobación | Resultado |
| --- | --- |
| URL pública antigua (`/uploads/comprobantes/…`) | **404** |
| `/api/archivo/<id>` sin sesión | **307 → `/login`**, cuerpo de 74 bytes, sin `content-type` de imagen |
| Administración lee los 4 archivos migrados | 200, `image/*`, tamaños correctos |
| Cabecera de la respuesta | `private, max-age=300` |
| Guarda intenta leer una factura de caja chica | **403** |
| Guarda lee una foto de visitante | 200 (le corresponde) |
| Imágenes en pantalla apuntando a `/uploads/` | **0** |
| Imágenes del repositorio que no cargan | **0** |
| Informe de caja chica | 200, 2 páginas, la factura incrustada como anexo |

`public/uploads/` ya no existe en el proyecto.

### Lo que quedó sin migrar, y por qué

Dos gastos de caja chica de prueba apuntan a facturas que **ya no estaban en el disco** antes de esta migración: `48e48e5f-…png` y `24acf0d2-…png`. El guion informa cada caso y deja la fila intacta en vez de inventar un archivo o borrar el dato en silencio. No hay riesgo de exposición —el archivo no existe— pero esos dos gastos quedan sin comprobante y así lo muestra el informe.

## Google Drive en producción: OAuth de usuario, no cuenta de servicio (2026-08-05)

La cuenta de servicio quedó configurada (proyecto `anexypro-drive`,
`anexypro-storage@anexypro-drive.iam.gserviceaccount.com`) y la conexión
funciona, pero **Google eliminó la cuota de almacenamiento de las cuentas de
servicio**: pueden leer una carpeta compartida, pero al subir responden
`403 — Service Accounts do not have storage quota`. Las dos vías que Google
ofrece son unidades compartidas (Workspace, de pago) o delegación OAuth.

Por eso el proveedor tiene ahora DOS modos de autenticación (los dos viven en
`google-drive-provider.ts`, nada más cambió):

- **OAuth de usuario** (el activo): el backend se autentica como
  `api.anexypro@gmail.com` con un refresh token de larga vida; los archivos
  viven en el Drive de esa cuenta (15 GB gratuitos) y son visibles y
  navegables desde drive.google.com. Variables `GOOGLE_DRIVE_OAUTH_*`.
- **Cuenta de servicio**: queda listo para el día en que haya Workspace con
  unidad compartida (`GOOGLE_DRIVE_SHARED_DRIVE_ID`).

OJO: la app OAuth está en modo «Prueba» con `api.anexypro@gmail.com` como
usuario de prueba. En ese modo Google puede vencer los refresh tokens a los
7 días **solo si el scope es "sensible"**; `drive` es *restringido*, no
sensible, pero si el token venciera hay que reautorizar
(`scripts/probar-drive.ts` lo detecta al fallar) o publicar la app.

### Cambio de proveedor con archivos existentes: migración perezosa de carpetas

Las filas de `StorageFolder` recuerdan con qué proveedor se crearon. Al
activar otro proveedor, `syncFolderWithActiveProvider` (en
`services/storage.ts`) migra la carpeta **en el momento de la primera
subida**: crea la carpeta en el proveedor activo (padres primero, de forma
recursiva e idempotente) y actualiza la fila. Los ARCHIVOS no se mueven:
cada `StorageObject` recuerda su proveedor y descargar/renombrar/eliminar
usan ESE proveedor, así los dos conviven indefinidamente. Mover un archivo
entre carpetas exige que ambas vivan en el proveedor del archivo; si no, el
sistema lo dice claro en vez de fallar raro.

### Lectura por destinatario (`canReadObject`)

Un residente puede abrir un archivo **dirigido a él** (`ownerPersonId`)
aunque viva en una carpeta de la administración — el caso de los avisos de
incumplimiento y su evidencia. Solo ese archivo, nunca la carpeta; no cruza
empresas y no amplía escritura ni borrado. Antes de esta regla el portal
mostraba el enlace y el residente recibía 403.
`scripts/retro-destinatario-evidencias.ts` marcó el destinatario en las
evidencias viejas (idempotente, `--dry` disponible).

### Guiones de apoyo

- `scripts/probar-drive.ts` — prueba la conexión real (healthCheck, subir,
  descargar, renombrar, eliminar) sin tocar la base.
- `scripts/activar-drive.ts` — activa Drive tras pasar el healthCheck, igual
  que la pantalla del master.
- `.demo-tools/verify-drive-repo.mjs` — verificación de punta a punta con
  navegador real: emite una notificación con evidencia, comprueba las
  carpetas nuevas y que el residente abra sus documentos con 200.

## PASO 9 — Eliminación física de los archivos de una cuenta DEMO (2026-08-11)

Cuando una demo llega a su **día 18** (inicio + 15 días de prueba + 3 de
gracia, `demoLifecycleDates` en `domain/demo-lifecycle.ts`), sus archivos
de Drive se pueden borrar de verdad — no a la papelera. `purgeDemoDriveFiles`
(`src/lib/services/demo-cleanup.ts`) hace ese borrado; la decisión de negocio
que dice si es seguro hacerlo vive, aparte, en `src/lib/domain/demo-cleanup.ts`
(funciones puras, 28 pruebas en `__tests__/demo-cleanup.test.ts`) — mismo
patrón que `domain/demo-lifecycle.ts` + `services/demo.ts`.

**TODAVÍA NO SE DISPARA SOLA.** A propósito: no está registrada en
`src/lib/jobs/index.ts`, así que el programador diario (`/api/cron`) nunca
la llama. Hoy se invoca solo a mano — desde `scripts/purgar-demo.ts` (con
`--dry` para solo diagnosticar, `--force` para saltar la fecha del día 18 en
pruebas) o desde el botón "Purgar archivos de Drive" / "Reintentar limpieza"
de `/master/usuarios-demo` (`purgar-demo-button.tsx` → `purgarDemoAction` →
`guardMaster()`).

### Identificación — nunca por nombre

1. El tenant/demo id ya es `Company.id` (PASO 8 no inventó uno nuevo).
2. La carpeta real sale de `Company.demoDriveFolderId` — el id REAL de
   Drive, no un nombre.
3. Se comprueba, con una fila real de `StorageFolder`, que esa carpeta es
   de esta empresa y cuelga del contenedor "DEMOS" (nunca de
   "Condominios"). Si algo no cuadra, se detiene sin borrar nada.
4. El árbol completo (subcarpetas y archivos) se recorre por
   `parentId`/`folderId` reales dentro de la base, con Row-Level Security
   aplicado — una fila de otra empresa no puede aparecer ahí, lo garantiza
   Postgres, no una condición del código.
5. Antes de cada borrado se le vuelve a preguntar al PROVEEDOR (no solo a
   la base) de quién es el recurso — `StorageProvider.inspectOwnership`
   (padres reales, `shared`) — y además se comprueba, empresa por empresa
   (`forEachCompany`), que ningún otro tenant tenga una fila con el MISMO
   id de Drive.

Si algo no se puede confirmar con absoluta seguridad, **no se borra**: el
elemento queda como `omitido` (o `error`), la demo pasa a
`DEMO_CLEANUP_FAILED` y el incidente completo (con motivo) queda anotado en
`DemoHistoryEntry`. Nunca se elimina una carpeta en cascada: cada carpeta se
borra recién cuando el proveedor la reporta REALMENTE vacía en ese instante
(`listChildren` en vivo, no solo lo que dice la base).

### Primitivos nuevos del `StorageProvider`

`deleteFile` (papelera) se conserva tal cual para el borrado normal de un
documento — un acta o un contrato borrados sin querer deben poder
recuperarse. La limpieza de una demo usa primitivos NUEVOS y distintos,
IDEMPOTENTES (un id que ya no existe no es un error):

- `listChildren(parentId)` — subcarpetas Y archivos, separados y paginados.
- `inspectOwnership(id)` — padres reales + `shared`, para el paso 5 de
  arriba.
- `deleteFilePermanently(id)` / `deleteFolderPermanently(id)` — `DELETE`
  real en Drive (no `PATCH trashed:true`); en el proveedor local,
  `unlink`/`rmdir` (`rmdir` sin recursividad: falla si no está vacía, red de
  seguridad extra y gratis).

### Idempotente, reintentable, auditable

- **Idempotente**: una demo `DEMO_ELIMINADO` no se vuelve a tocar. Un
  elemento que el proveedor ya no tiene cuenta como éxito, no como fallo.
- **Reintentable**: cada elemento borrado (o ya inexistente) se quita de la
  base al instante, así que reintentar sobre una limpieza que falló a
  medias solo reprocesa lo que de verdad sigue pendiente.
- **Auditable**: cada corrida (éxito, fallo o no-op) queda en
  `DemoHistoryEntry` con la fecha, el detalle y quién la disparó, y
  `Company.demoStatus`/`demoDeletedAt` reflejan el resultado final. El
  resumen que se guarda trae exactamente lo pedido: archivos encontrados,
  eliminados, carpetas eliminadas, y el detalle de cada fallo.

Verificado de punta a punta contra el proveedor `local` (nunca contra el
Drive real de producción): demo creada → archivo subido → purgada (31
carpetas + 1 archivo borrados en el orden correcto, hojas antes que la
raíz) → reintento idempotente ("ya fue purgada, no se tocó nada") → 0
filas y 0 archivos físicos restantes. Contra la base real también se probó
el camino de incidente: una demo con una carpeta huérfana en la base pero
sin `demoDriveFolderId` se detiene sola con `DEMO_CLEANUP_FAILED` en vez de
adivinar.

## PASO 10 — Conversión de DEMO a cuenta formal, conservando Drive (2026-08-11)

`convertDemoToFormal` (`services/demo.ts`) convierte **en la misma fila de
`Company`** — nunca crea una empresa nueva. Como el tenant/demo id YA ES
`Company.id` (PASO 8) y `StorageFolder`/`StorageObject` solo se relacionan
por `companyId`/`condominiumId` (nunca por `isDemo`), la conversión no
necesita tocar el proveedor de almacenamiento **en absoluto**: cero
llamadas a Drive, cero descargas, cero resubidas, cero filas nuevas. Los
tres campos `demoDriveFolder*` de `Company` (id real, nombre, fecha de
creación) tampoco se tocan — quedan como estaban, ahora como registro
histórico de dónde vive la carpeta.

Lo que "cancela cualquier eliminación programada" son DOS capas
independientes: `demoExpiresAt`/`demoDeleteScheduledAt` pasan a `null`
(así que `demo-vencidos` nunca la vuelve a marcar), y
`evaluatePurgeEligibility` (`domain/demo-cleanup.ts`, PASO 9) rechaza de
entrada cualquier intento de purga sobre `demoStatus === 'DEMO_CONVERTIDO'`
— aunque alguien llamara a `purgeDemoDriveFiles` a mano sobre una cuenta ya
convertida, el borrado no procede.

**Registrado** en `DemoHistoryEntry` (evento `convertida_formal`) y en
`AuditLog`, los 6 datos pedidos en un solo detalle legible: fecha/hora
(`occurredAt`), usuario master (`actorUserId` + nombre), cuenta DEMO
original y cuenta formal resultante (el MISMO `companyId`, dicho
explícito — no hay dos cuentas), carpeta de Drive conservada (id + nombre,
o "sin carpeta creada todavía" si la demo nunca llegó a subir nada), y
plan contratado. `ConvertirDemoResultado.carpetaDriveConservada` también
lo devuelve a la pantalla, que lo muestra en el modal de confirmación.

### Prueba completa realizada

Contra el proveedor `local` (mismo código de `services/storage.ts` que usa
Drive — la interfaz es idéntica; no se tocó el Drive real de producción):

1. Demo creada (`createDemoCompany`).
2. Imagen (PNG) subida a Multimedia/Fotografías.
3. PDF subido a Administración/Actas.
4. Documento (.docx) subido a Contratos/Proveedores.
5. Convertida a cuenta formal (`convertDemoToFormal`, plan real, master real).
6. Verificado por base de datos: `isDemo=false`, `demoStatus=DEMO_CONVERTIDO`,
   `demoExpiresAt`/`demoDeleteScheduledAt=null`, `demoDriveFolderId`
   **exactamente igual** antes y después, mismo `companyId`, **misma**
   cantidad de carpetas (31) y archivos (3) en la base — sin duplicar,
   mismos `id` de fila y `providerFileId` — y los 3 archivos con el
   **mismo sha256** leídos de nuevo del disco tras la conversión.
7. Con sesión real de navegador, login como el MISMO usuario `admin_owner`
   de la demo (ahora de la cuenta formal) contra `/app/repositorio`.
8. Los 3 archivos, abiertos por la ruta real de descarga
   (`/api/documentos/[token]`, con permisos reverificados en el momento):
   **200**, `content-type` correcto (`application/pdf`, `image/png`,
   `application/vnd...wordprocessingml.document`) y bytes **idénticos** a
   los subidos — la conversión no perdió ni corrompió nada.

## PASO 11 — Historial comercial permanente de una demo (2026-08-11)

Los 15 campos pedidos ya vivían, en su mayoría, en `Company` — lo nuevo
son tres columnas (`demoConvertedById`, `demoConvertedPlanName`,
`demoCommercialNotes`) y una corrección real de un hueco que ya existía.

**Bug corregido**: `listDemoCompanies`/`getDemoDetail` filtraban por
`Company.isDemo`. Como `convertDemoToFormal` pone `isDemo: false` en el
momento exacto de convertir, una cuenta convertida **desaparecía** del
panel `/master/usuarios-demo` justo cuando su historial comercial tenía
que seguir disponible — lo contrario de lo que pide PASO 11. Ahora
filtran por `demoStatus: { not: null }`, que se fija al crear la demo y
NUNCA vuelve a `null` (ni al convertir, ni al purgar) — es el criterio
correcto para "toda empresa que alguna vez fue una demo".

`DemoSummary` (`services/demo.ts`) trae ahora los 15 campos exactos:
cliente/prospecto, correo, teléfono, condominio, fecha de creación, de
inicio, de vencimiento, de eliminación, quién creó, estado final, si fue
convertida, fecha de conversión, quién convirtió, plan adquirido (foto
fija tomada UNA vez al convertir — si después cambia el plan vigente,
este campo no se entera) y observaciones comerciales (el único campo
editable después de escrito, vía `updateDemoCommercialNotes` — botón
"Guardar notas" en el panel). Ninguno de los 15 es un archivo ni un dato
operativo del condominio: es una ficha comercial, no un respaldo.

Sobrevive a todo porque la fila de `Company` **nunca se borra
físicamente** en ningún punto del sistema — ni `purgeDemoDriveFiles`
(PASO 9, solo borra `storage_folders`/`storage_objects`) ni
`convertDemoToFormal` (PASO 10, reutiliza la misma fila) tocan
`companies` con un `delete`.

**Auditoría de las 8 acciones pedidas**, todas como filas de
`DemoHistoryEntry` (evento + detalle + fecha + quién): `creada` (crear),
`reactivada` (reactivar), `vencida` (vencer, job `demo-vencidos`),
`convertida_formal` (convertir), `limpieza_iniciada` (NUEVO — al pasar la
elegibilidad, antes de tocar nada), `archivos_eliminados` (NUEVO — al
terminar de borrar, solo si de verdad se borró algo en esa corrida),
`eliminada` (completar limpieza) y `limpieza_fallida` (fallar limpieza).

**UI**: botón "Ver historial" en cada tarjeta de `/master/usuarios-demo`
— sin excepción, ni para una demo ya `DEMO_ELIMINADO` ni para una
`DEMO_CONVERTIDO` (es un historial, no una acción del ciclo de vida).
Muestra los 15 campos, la libreta de notas editable, y la línea de
tiempo completa con el nombre de quien disparó cada evento.

### Verificado

Contra la base real: una purga de punta a punta mostró la secuencia
`creada → limpieza_iniciada → archivos_eliminados → eliminada` en orden.
Una conversión nueva completó `demoConvertedById`/`demoConvertedPlanName`
correctamente. El panel mostró 3 tarjetas "Convertida" donde antes
mostraba 1 (las 2 reales que el filtro por `isDemo` escondía). Guardar
observaciones comerciales persistió en la base y sobrevivió a recargar
la página.
