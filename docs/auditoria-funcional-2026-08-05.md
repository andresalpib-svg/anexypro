# Auditoría funcional completa — ANEXYpro

**Fecha:** 5 de agosto de 2026
**Alcance:** módulos existentes, navegación, permisos por rol, autenticación, sesiones, rendimiento, experiencia de usuario, responsividad, seguridad e integraciones.
**Regla de la auditoría:** no se agregó ninguna funcionalidad nueva. Solo corrección de defectos.

**Base verificada:** 368 archivos TS/TSX (~45.400 líneas), 88 rutas reales (81 páginas + 7 route handlers), 53 archivos de server actions, 56 servicios, 5 roles.

---

## 1. Estado de partida

| Comprobación | Resultado |
|---|---|
| `tsc --noEmit` | Limpio |
| 205 pruebas Vitest | 205/205 pasan |
| 34 pantallas del panel | 34/34 responden 200 |
| 13 pantallas del portal | 13/13 |
| 2 de la caseta + 8 del master | 10/10 |
| Enlaces internos (95 destinos) | 0 rotos |
| Inyección SQL / XSS por `dangerouslySetInnerHTML` / secretos en el repositorio | Limpio |

El sistema **no estaba roto**. Los hallazgos son de autorización y de robustez, no de funcionamiento.

---

## 2. Errores encontrados

### Críticos (corregidos)

**C1 — Escalada de privilegios entre empresas.**
`src/lib/services/settings.ts` — `toggleStaffPermission` actualizaba `user` con `where: { id: userId }` sin `companyId`. La tabla `users` está deliberadamente fuera de RLS (el aislamiento lo hace la aplicación), y aquí no lo hacía: un administrador de la empresa A podía otorgar o revocar permisos a usuarios de la empresa B enviando el id a mano.

**C2 — XSS almacenado por tipo de archivo declarado por el cliente.**
El `mimeType` guardado venía de `file.type`, que lo declara el navegador y es falsificable. `/api/archivo/[id]` y `/api/documentos/[token]` lo devolvían tal cual con `Content-Disposition: inline`. Un archivo llamado `factura.pdf` con cuerpo HTML y tipo `text/html` se servía como página **dentro del origen de la aplicación**: quien lo abriera (incluido un residente al ver una evidencia dirigida a él) ejecutaba ese HTML con su sesión. `nosniff` no protegía, porque el tipo declarado ya era HTML.

**C3 — El explorador del repositorio aceptaba cualquier extensión.**
`uploadDocumentAction` llamaba a `uploadToFolder` directamente, saltándose la única capa que aplica la lista blanca. Se podían subir `.html`, `.svg` y `.htm` — el vector más directo para explotar C2.

### Altos (corregidos)

**A1 — Permisos por rol no se aplicaban a la URL.** El menú ocultaba los módulos sin permiso, pero escribir la dirección entraba igual. **Comprobado en vivo:** el supervisor con `asistentesia: false` veía la pantalla completa de Asistentes IA; el contador externo — que por decisión de producto no debe ver datos personales de condóminos — entraba a Propiedades y Residentes, Gestión de Tareas, Incumplimientos y Condominios.

**A2 — Finanzas no validaba el condominio.** `generateBillingAction`, `addChargeAction` y `makePaymentAction` comprobaban el área pero no la asignación: un supervisor podía emitir la facturación ordinaria, cargar montos y registrar pagos en condominios que no administra, cambiando un campo oculto del formulario.

**A3 — Las páginas de detalle exponían condominios ajenos.** Propiedades, Proyectos, Asambleas, Comunicados y Condominios resolvían por `companyId` sin comprobar la asignación. La ficha de una unidad lleva cédulas, correos, vehículos y contactos de emergencia de los residentes.

**A4 — Acciones de escritura sin validar el condominio.** Asambleas (abrir/cerrar votación, publicar acta), Proyectos (4 acciones), Documentos (3, incluida archivar), Comunicados (publicar) y 7 de las 9 acciones de Gestión de Tareas. El propio archivo de tareas ya definía la guarda y la usaba solo en 2 de 9 — era un olvido, no un criterio.

**A5 — Activar condominio solo pedía sesión.** La acción en línea `handleActivate` no comprobaba rol: cualquier usuario del panel, incluido el contador, podía activar condominios.

**A6 — Descarga del informe de caja chica sin comprobar el área.** Los route handlers no pasan por el layout; un supervisor con Mantenimientos apagado descargaba el PDF con las facturas incrustadas.

**A7 — Redirección abierta tras el login.** `?callbackUrl=https://sitio-falso` llevaba al usuario fuera del dominio justo después de autenticarse.

### Medios (parcialmente corregidos)

- **M1** — `/app/contabilidad` no está en el menú, así que apagar «Finanzas y Contabilidad» desde el panel master la dejaba accesible por URL. **Corregido.**
- **M2** — Precios de planes con `Number(...) ?? 0`: `Number('abc')` es `NaN` y `?? 0` no lo atrapa; un precio con letras entraba a la base como `NaN` y uno negativo pasaba tal cual. **Corregido.**
- **M3** — El middleware gateaba por prefijo de texto (`startsWith('/app')` casaría con `/aplicaciones`). **Corregido.**
- **M4** — Fechas validadas como `z.string().min(1)` y luego `new Date()` sin comprobar: una fecha inválida se guarda como `Invalid Date`. Afecta a 8 esquemas. **Pendiente.**
- **M5** — `reservationSchema` no valida el formato de hora ni exige `endsAt > startsAt`: con 23:00–01:00 el solapamiento no se detecta. **Pendiente.**
- **M6** — Argumentos de server action tipados en TypeScript pero sin validar en ejecución (el tipo no existe en runtime). **Pendiente.**
- **M7** — Documentos y Contenido guardan URL libre (`z.string().url()` acepta `javascript:`) porque el módulo aún no tiene subida real. **Pendiente.**

### Bajos (documentados, no corregidos)

- Sin límite de intentos de acceso; y el retorno anticipado cuando el correo no existe permite enumerar correos por diferencia de tiempo.
- Cambios de rol y bloqueo de usuario tardan hasta 20 minutos (el token no se revalida contra la base; el `maxAge` de 20 min acota la ventana).
- No existe `not-found.tsx` ni `error.tsx` en ningún nivel: los 404 y los errores caen en la pantalla genérica de Next, fuera del diseño.
- `?mes=2026-99` deja la cabecera del calendario sin nombre de mes (no rompe, se ve mal).
- Ruta huérfana `/evento/[id]`: viva y protegida, pero ya nadie enlaza a ella.
- 4 enlaces internos usan `<a>` en vez de `<Link>` y provocan recarga completa (navegación de carpetas del repositorio, resultados de búsqueda, ficha de propiedad).
- De ~50 formularios, solo 3 campos usan `required`: todo se valida en el servidor, así que el usuario espera el viaje de ida y vuelta para ver el error.

---

## 3. Correcciones realizadas

| # | Archivo | Corrección |
|---|---|---|
| 1 | `lib/services/settings.ts` | `companyId` en el filtro + restricción a roles de staff |
| 2 | `lib/storage/serve-headers.ts` *(nuevo)* | Tipo y disposición derivados de la extensión, con lista blanca de tipos que pueden ir `inline` |
| 3 | `api/archivo/[id]`, `api/documentos/[token]`, `services/file-refs.ts` | Usan el módulo anterior; deja de confiarse en `file.type` |
| 4 | `app/repositorio/actions.ts` | Lista blanca de extensiones y tope de 100 MB |
| 5 | `app/app/layout.tsx` + `lib/nav-config.ts` | `navItemForPath()` aplica a la pantalla las mismas reglas que el menú y las acciones |
| 6 | `app/finanzas/actions.ts` | Migrado a `requirePanel` con condominio + la filial debe pertenecer al condominio declarado |
| 7 | 5 páginas `[id]` | `canAccessCondo` antes de renderizar |
| 8 | `asambleas`, `proyectos`, `documentos`, `comunicados`, `gestion` | Condominio resuelto desde la entidad (`entity-scope`), nunca del formulario |
| 9 | `lib/services/entity-scope.ts` | 7 resolutores nuevos (asamblea, punto, proyecto, documento, comunicado, punto de checklist, adjunto) |
| 10 | `condominios/[id]/page.tsx` + `services/condominiums.ts` | `requireOwner` en la activación + `companyId` en el `where` |
| 11 | `mantenimiento/informe-caja-chica/route.ts` | Comprobación del área |
| 12 | `login/login-form.tsx` | Solo se acepta destino interno |
| 13 | `services/module-visibility.ts` | `/app/contabilidad` sigue la visibilidad de `/app/finanzas` |
| 14 | `master/suscripciones/actions.ts` | Validación numérica real (rechaza `NaN` y negativos) |
| 15 | `middleware.ts` | Coincidencia por segmento, no por prefijo de texto |
| 16 | Base de datos | Reactivada la cuenta `contador@anexypro.com`, bloqueada en pruebas del 3 de agosto |

### Verificación de las correcciones

Con navegador real, sesión real y los 5 roles:

- **Supervisor:** Asistentes IA, Finanzas, Reportes y Configuración → redirigen al Dashboard. Gestión, Incumplimientos y Dashboard siguen accesibles.
- **Contador:** solo Finanzas, Contabilidad, Reportes, Documentos, Repositorio y su perfil. Propiedades, Gestión, Incumplimientos y Condominios → redirigen a Finanzas.
- **Aislamiento por condominio:** el supervisor (asignado solo a Altamar) recibe 404 en las 5 fichas de Natura Viva. El administrador entra a todas — sin regresión.
- **Tipo de archivo:** un archivo con cuerpo HTML y `type: text/html` subido como `.png` se sirve como `image/png` con `nosniff`; el navegador no lo ejecuta.
- **Repositorio:** `malicioso.html` se rechaza con mensaje claro.
- **Sin regresiones:** 34/34 pantallas del panel, 13/13 del portal, 2/2 de la caseta, 8/8 del master. `tsc` limpio y 205/205 pruebas.

---

## 4. Riesgos pendientes

**Alto**

1. **El SQL que no está en las migraciones.** `prisma/sql/01_views_functions_triggers.sql` define la restricción `EXCLUDE USING gist` que impide reservas solapadas y el trigger `sync_charge_status` que marca los cargos como pagados. Ninguno forma parte de `prisma/migrations/`; se aplican a mano. En Vercel el build es `prisma generate && next build` y **nada los aplica**. Sin ellos: doble reserva del mismo salón a la misma hora, y cargos que nunca pasan a «pagado» (morosidad inflada en reportes y cobranza). Lo mismo vale para los cuatro archivos de RLS.

2. **Sin `CRON_SECRET` no corre ningún proceso automático.** Intereses moratorios, facturación de la cuota, gastos recurrentes, alertas de contratos, escalamiento de cobranza e informe mensual dependen de la llamada diaria a `/api/cron`. El sistema **se ve funcionando sin estarlo**.

3. **Carreras en pagos y reservas.** El registro de pagos lee los cargos pendientes y crea el pago sin bloqueo de fila: dos pagos concurrentes de la misma unidad se asignan contra los mismos cargos. Un doble clic basta. La restricción de la base era la última defensa y hoy no está aplicada (riesgo 1).

**Medio**

4. **Rendimiento — el layout del panel.** Cada navegación consulta tres veces la misma fila de `company`, dos de ellas en cascada secuencial (~120 ms de sobrecosto por clic), y calcula el aviso de atrasos aunque solo se muestre una vez al día.

5. **Rendimiento — consultas sin límite.** 126 de 147 `findMany` en los servicios no tienen `take`. Los que más duelen: el historial de visitas (se ejecuta **dos veces** por carga en el portal del residente, porque el cálculo de alertas repite la consulta) y el estado de cuenta de una unidad.

6. **Índices que faltan.** `Charge` no tiene índice por `status`, aunque el filtro `status IN ('pendiente','parcial') AND dueDate < hoy` es el más usado del producto (morosidad, cobranza, intereses, reportes). `Payment` no tiene índice por `condominiumId`, que es justo por donde filtra su política RLS. Y 19 modelos no tienen ninguno, incluido todo Asambleas. **Son migraciones triviales hoy y dolorosas con las tablas llenas.**

7. **Imágenes.** 28 `<img>` sin dimensiones ni `loading="lazy"`, y las galerías muestran el original escalado por CSS. Un caso de incumplimiento con 6 fotos de móvil descarga ~24 MB para pintar seis miniaturas de 112 px, y cada archivo se carga entero en memoria del servidor.

8. **Escrituras en cada lectura de visitas.** El barrido de vencimiento hace dos `UPDATE` cada vez que se listan visitas. La caseta refresca cada 10 segundos: miles de escrituras diarias que casi siempre afectan 0 filas.

9. **Compatibilidad móvil.** Las pantallas responden en 375 px, pero **las tres barras laterales son de ancho fijo y no se colapsan**: en un teléfono ocupan la mayor parte del ancho y el contenido queda comprimido. Es un problema real para el portal del residente, que es el que más se usa desde el teléfono.

10. **`bodySizeLimit` de 10 MB contra límites de 100 MB.** Los mensajes cuidados («máximo 100 MB», «máximo 20 MB») son inalcanzables: todo lo que supere 10 MB muere antes con un error opaco de Next. Un video de comunicado nunca podrá subirse.

**Bajo**

11. Sin límite de intentos de acceso (fuerza bruta libre) y enumeración de correos por temporización.
12. Bloquear a un usuario tarda hasta 20 minutos en surtir efecto.
13. Sin `error.tsx` ni `not-found.tsx`: cualquier fallo muestra la pantalla genérica de Next.
14. ~60 puntos devuelven `e.message` crudo de Prisma o del proveedor al formulario del usuario.

---

## 5. Recomendaciones antes de salir a producción

**Bloqueantes**

1. **Meter el SQL en el despliegue.** Convertir `prisma/sql/*.sql` en migraciones, o añadir `tsx scripts/aplicar-sql.ts` al proceso de despliegue y **verificar después** que la restricción de reservas y el trigger de cargos existen en la base de producción. Sin esto se cobra mal y se reserva doble.
2. **Crear el rol de base de datos sin superusuario** (`scripts/crear-rol-app.sql`), poner ese rol en `DATABASE_URL` y el dueño en `DIRECT_URL`, y aplicar los cinco archivos de RLS en orden. Sin esto desaparece el aislamiento entre empresas.
3. **Definir `CRON_SECRET`** (`openssl rand -hex 32`) y **programar la llamada diaria** a `/api/cron`.
4. **Cambiar la contraseña del administrador inicial** (`admin@tuempresa.com` sigue con la del seed) y borrar o bloquear las cuentas de prueba (`master@`, `administrador@`, `supervisor@`, `contador@`, `condomino@`, las `@demo.anexypro.com`).
5. **Revisar los datos de prueba.** Conviven el condominio demo, uno de pruebas y datos reales de Natura Viva. Definir qué se conserva.

**Muy recomendables antes de abrir a usuarios**

6. Añadir los índices de `Charge` y `Payment` y los de Asambleas — ahora es una migración de segundos.
7. Unificar las tres consultas de `company` del layout y calcular el aviso de atrasos solo cuando toca mostrarlo.
8. Poner `take` a las consultas que crecen sin techo (visitas, cargos, pagos) y eliminar la consulta duplicada del portal de visitas.
9. `loading="lazy"` y dimensiones en los 28 `<img>`, y generar miniatura al subir. Es lo que más se va a notar en el teléfono.
10. **Colapsar las barras laterales en móvil.** Sin esto el portal del residente es incómodo en el teléfono, que es donde más se usará.
11. Subir `bodySizeLimit` a un valor coherente con los límites del código, o bajar los límites del código al del runtime. Hoy se contradicen.
12. Limitar los intentos de acceso y ejecutar siempre la comparación de contraseña (aunque el correo no exista) para cerrar la enumeración.
13. Añadir `error.tsx` y `not-found.tsx` en `/app`, `/portal`, `/seguridad` y `/master`.
14. Dejar de devolver `e.message` crudo: registrarlo y mostrar un mensaje propio.

**Deuda funcional conocida**

15. Validar fechas y horas en los esquemas (M4, M5) y los argumentos de las server actions con `z.enum()` (M6).
16. Exigir `https:` en las URL de Documentos y Contenido, o construir la subida real (M7).
17. Revalidar `status` y `role` contra la base en el callback del token para que bloquear a un usuario tenga efecto inmediato.

---

## 6. Cierre

Se corrigieron **16 defectos**: 3 críticos, 7 altos, 3 medios y 3 de saneamiento, todos verificados con navegador real y sesiones reales de los 5 roles, sin regresiones (57 pantallas, `tsc` limpio, 205/205 pruebas).

El patrón de fondo de los hallazgos de autorización es uno solo, y conviene tenerlo presente al construir cualquier módulo nuevo: **en Next.js el menú y el layout protegen la pantalla; la acción y el route handler tienen que autorizarse por su cuenta**, y el condominio sobre el que se actúa debe salir de la base de datos, nunca de un campo del formulario. `lib/guard.ts` y `lib/services/entity-scope.ts` existen justo para eso y ahora cubren los módulos que se habían quedado fuera.

Lo que más riesgo tiene hoy **no es el código, es el despliegue**: el SQL que no viaja en las migraciones y el `CRON_SECRET` que falta hacen que el sistema se vea funcionando sin estarlo.

---

# Segunda fase — SQL en el despliegue y recomendaciones previas a producción

**Fecha:** 5 de agosto de 2026 (misma jornada, después del informe anterior).

## 7. Dos fallos nuevos, más graves que los del informe

**N1 — El despliegue no aplicaba NADA a la base.** El `buildCommand` de
Vercel era `npm run build` = `prisma generate && next build`. No corría
`prisma migrate deploy` **ni** el SQL de `prisma/sql/`. El script
`db:deploy` existía en `package.json` pero no lo invocaba nadie.

**N2 — Las migraciones fallaban en una base vacía.** La carpeta
`20260719230128_asset_amenity_attachments` ordenaba **antes** que
`20260720024752_init`, que es la que crea las tablas. Comprobado contra
una base limpia: `prisma migrate deploy` aborta en la primera migración
con «relation "amenities" does not exist». Producción es una base
nueva, así que **no habría arrancado**.

**N3 — Fuga de documentos entre empresas (crítico).** La política
`resident_read_documents` de `prisma/sql/02` no filtraba por empresa.
Postgres combina las políticas permisivas con **OR**, así que anulaba a
`tenant_documents`: cualquier empresa leía los documentos marcados
`residentes` + `vigente` de todas las demás. **Reproducido en vivo**:
se creó una empresa B con un documento y la empresa A lo leyó desde su
propio contexto. Corregido y vuelto a comprobar: ya no lo ve.

**N4 — Prisma no corre en Edge.** Al añadir la revalidación del token
en el callback `jwt`, el middleware (que corre en Edge Runtime)
empezó a lanzar `JWTSessionError` en cada petición pasados dos minutos.
Detectado en pruebas antes de darlo por bueno; resuelto saltando la
revalidación cuando `NEXT_RUNTIME === 'edge'`.

## 8. Qué se hizo

**Despliegue de base de datos**
- Los cinco `.sql` son ahora **idempotentes** (`DROP … IF EXISTS` antes
  de crear triggers, políticas y restricciones). Probado aplicándolos
  dos veces seguidas.
- `scripts/desplegar-bd.ts`: migraciones → SQL en orden → verificación.
- `scripts/verificar-bd.ts`: **diez comprobaciones**, entre ellas la
  restricción de reservas, el trigger de cargos, RLS forzado, que
  ninguna tabla tenga RLS sin política, que el rol de la aplicación no
  sea superusuario, y —nuevo— que **ninguna política permisiva ignore
  la empresa**, que es el fallo N3 convertido en prueba permanente.
- `vercel.json` → `npm run vercel-build`, que corre todo eso **antes**
  de compilar. Si la verificación falla, el despliegue se detiene.
- Migración `20260719230128…` renombrada a `20260720030000…` para que
  ordene después de `init`. Verificado: base vacía → migraciones → SQL
  → 10/10 comprobaciones.
- `vercel.json` incluye la llamada diaria a `/api/cron` (`0 14 * * *` =
  8:00 en Costa Rica; Vercel programa en UTC). Sigue dependiendo de que
  se defina `CRON_SECRET`.

**Rendimiento**
- Seis índices nuevos (`20260805_indices_rendimiento`): el de `charges`
  por `(condominium_id, status, due_date)` —el filtro más usado del
  producto—, `payments` por condominio y fecha, `condominium_supervisors`
  por usuario, y los de asambleas y destinatarios de comunicados.
- El layout de `/app` hacía **tres** consultas a la misma fila de
  `companies`, dos encadenadas. Ahora es una (`getCompanyShell`).
- El aviso de atrasos se calculaba en cada navegación aunque se muestre
  una vez al día; ahora se lee la cookie en el servidor y se salta.
  Además las listas van acotadas y los contadores se piden aparte.
- `/portal/visitas` ejecutaba **dos veces** la misma consulta pesada
  (`getResidentVisitAlerts` llamaba por dentro a `listVisitsByProperty`).
  Ahora los avisos se derivan de la lista ya cargada.
- Los listados de visitas llevan tope (300); el barrido de vencimientos
  ya no escribe en cada lectura, se recuerda por condominio y día.

**Experiencia de uso**
- Las tres barras laterales se **colapsan en móvil**: barra superior con
  menú, cajón con fondo atenuado, cierre al navegar, con Escape o
  tocando fuera. En escritorio no cambia nada. Verificado en 375 px.
- `loading="lazy"` en 20 imágenes de miniaturas y galerías.
- `not-found.tsx` y `error.tsx` propios en las cuatro zonas, más
  `global-error.tsx` para los fallos del propio layout (se comprobó que
  un `error.tsx` **no** captura los errores de su layout).

**Seguridad y validación**
- Login: se compara la contraseña **siempre**, exista el correo o no
  (cierra la enumeración por tiempo); tope de 8 intentos fallidos por
  cuenta en 15 minutos; revalidación de rol, permisos y estado cada dos
  minutos. **Verificado**: un usuario bloqueado en la base queda fuera y
  cae en `/login`; el tope frena a la cuenta atacada sin afectar a otras.
- Validadores compartidos de fecha, hora y URL (`validations/comunes.ts`)
  aplicados a reservas, asambleas, proyectos, tareas, visitas,
  documentos y contenido. Las reservas ahora exigen `endsAt > startsAt`
  —con 23:00–01:00 el solapamiento no se detectaba y se podían crear dos
  reservas sobre la misma franja—. Las URL solo admiten http(s):
  `z.string().url()` aceptaba `javascript:`.
- `mensajeDeError` deja de devolver el texto crudo de Prisma o del
  proveedor al formulario, sin ocultar los mensajes de negocio.
- `bodySizeLimit` alineado con los límites del código.

## 9. Estado

`tsc` limpio · **222 pruebas** (17 nuevas) · build de producción correcto ·
**59 pantallas** verificadas con los cinco roles sobre el build de
producción · 10/10 comprobaciones de base de datos · bloqueos por rol
confirmados (supervisor y contador).

## 10. Lo que sigue pendiente — y es de Freddy

1. **`CRON_SECRET`** (`openssl rand -hex 32`) en las variables de
   Vercel. La programación ya está puesta; sin la variable no corre.
2. **Rol de base de datos sin superusuario** en producción
   (`scripts/crear-rol-app.sql`), con ese rol en `DATABASE_URL` y el
   dueño en `DIRECT_URL`. `npm run db:verify` avisa si no está.
3. **Contraseña del administrador inicial** y limpieza de las cuentas de
   prueba (`master@`, `administrador@`, `supervisor@`, `contador@`,
   `condomino@`, las `@demo.anexypro.com`).
4. **Decidir qué datos se conservan**: conviven el condominio demo, uno
   de pruebas y datos reales de Natura Viva.
5. **Archivos grandes en Vercel.** `bodySizeLimit` ya no estorba, pero
   una función serverless de Vercel no acepta cuerpos de más de ~4,5 MB.
   Los videos de comunicados **no se van a poder subir** por una server
   action; hace falta subida directa al proveedor de almacenamiento.
   Es trabajo aparte y hay que decidir si entra antes de abrir.
6. **`/api/cron` declara `maxDuration = 300`**: el plan Hobby de Vercel
   corta a los 60 segundos.
7. **Estado de cuenta sin paginar**: se dejó a propósito. Calcula un
   saldo acumulado sobre todos los movimientos, así que truncarlo daría
   un saldo **incorrecto**; paginarlo bien exige un renglón de saldo
   inicial, que es un cambio de producto. A volumen real (~180 filas
   tras cinco años) no es un problema.
8. Quedan sin cerrar los puntos menores del informe anterior:
   argumentos de server action sin `z.enum()`, `?mes=` sin validar rango,
   los cuatro `<a>` internos que deberían ser `<Link>`, y los ~50
   formularios sin `required` en el cliente.
