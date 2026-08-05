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
