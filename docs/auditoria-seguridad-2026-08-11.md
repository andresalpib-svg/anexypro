# Auditoría de seguridad — 11 de agosto de 2026

Auditoría solicitada expresamente sobre: (1) APIs de acceso público indebido,
(2) fugas de datos entre condominios/empresas (IDOR), (3) bugs de loops /
agotamiento de recursos, (4) fuerza bruta y saturación de login, (5) barrido
general (secretos, inyección, headers, sesión, archivos, IA).

> **Actualización 2026-08-11 (misma noche):** los 6 hallazgos que el usuario
> pidió corregir primero (#1 a #9 de la tabla, salvo el #10 aparte) ya están
> corregidos, con `tsc --noEmit` limpio y los 318 tests existentes en verde.
> Cada sección de abajo tiene su nota de "✅ Corregido" con el detalle. El
> resto de los hallazgos (medios/bajos) sigue pendiente.
>
> **✅ Y ya están DESPLEGADOS EN PRODUCCIÓN** (misma noche, en dos pasos):
> primero se aisló y desplegó solo la migración `rate_limit_hits` vía un
> `git worktree` separado (`vercel deploy --prod`, ver la nota de la sección
> 2-3 más abajo); después se commiteó el resto del working tree completo
> (rama `features-y-seguridad-2026-08-11`, fusionada a `main` en `b196c9f`) y
> se desplegó de nuevo — build `READY`, alias `https://api.anexypro.com`
> actualizado, verificado con `curl` (`/login`, `/demo`, `/recuperar` → 200;
> `/api/cron` sin sesión → redirige a login).

Se hizo con 4 revisiones independientes en paralelo sobre el código de
`anexypro-app 10` (App Router, Prisma, NextAuth, RLS en Postgres). No se
ejecutó ni explotó nada — es revisión estática de código.

**Contexto que ya trae el proyecto:** existe RLS forzado en Postgres
(`app.current_company_id`) que aísla datos **entre empresas** incluso si el
código de aplicación falla — ver `docs/revision-seguridad.md`. Ese nivel está
bien defendido. El punto débil real es el aislamiento **dentro de la misma
empresa**, entre condominios y entre unidades/propietarios, que depende 100%
de que cada Server Action llame explícitamente a los helpers
`condoOf*()` + `canAccessCondo()`/`allowsCondo()` de
`src/lib/services/entity-scope.ts` y `src/lib/guard.ts`. La mayoría de los
módulos lo hace bien; los hallazgos de abajo son los puntos donde no.

---

## Resumen priorizado

| # | Severidad | Área | Archivo | Problema | Estado |
|---|---|---|---|---|---|
| 1 | **Crítico** | Cron / multi-tenant | `src/app/api/cron/route.ts` | Un `admin_owner` de **cualquier** empresa dispara facturación/mora/cobranza de **todas** las empresas de la plataforma | ✅ Corregido |
| 2 | **Alto** | Fuerza bruta | `src/lib/auth.ts`, todo el stack | No hay rate limiting por IP en ningún endpoint (login, recuperar, demo) — solo freno por cuenta | ✅ Corregido |
| 3 | **Alto** | Fuerza bruta | `src/lib/auth.ts` | Password spraying no mitigado: 1 password contra miles de cuentas nunca activa el freno por cuenta | ✅ Corregido |
| 4 | **Alto** | DoS / carrera | `src/lib/services/demo.ts` | `/demo`: tope global (no por IP) + condición de carrera (TOCTOU) que lo salta + sin CAPTCHA | ✅ Corregido (salvo CAPTCHA, ver nota) |
| 5 | **Alto** | IDOR intra-empresa | `src/app/app/emision-documentos/actions.ts` | Supervisor aprueba/rechaza/re-plantilla documentos oficiales de condominios que no administra | ✅ Corregido |
| 6 | **Alto** | IDOR intra-empresa | `src/app/app/finanzas/gastos/actions.ts` (`payExpenseAction`) | Registra un pago sobre un gasto de un condominio no asignado | ✅ Corregido |
| 7 | **Alto** | IDOR intra-empresa | `src/app/app/incumplimientos/actions.ts` (`closeCaseAction`) | Cierra expedientes disciplinarios de condominios ajenos | ✅ Corregido |
| 8 | **Alto** | Enumeración | `src/app/recuperar/actions.ts` | Timing leak: se puede saber si un correo existe midiendo el tiempo de respuesta | ✅ Corregido |
| 9 | **Alto** | DoS lógico | `src/lib/services/import-excel.ts` | Sin límite de filas: una carga grande bloquea una conexión de BD hasta 180s, agotable en paralelo | ✅ Corregido |
| 10 | Media-Alta | Acceso indebido | `src/app/app/repositorio/actions.ts` | Bypass total de validación de condominio para rol `master` | ✅ Corregido |
| 11 | Media | IDOR | `src/app/app/condominios/actions.ts` (asignar/quitar supervisor) | Depende solo de RLS, sin segunda verificación de aplicación | ✅ Corregido |
| 12 | Media | IDOR | `src/app/app/finanzas/cobranza/actions.ts` (`logActionAction`) | Registra gestión de cobro contra una filial de otro condominio | ✅ Corregido |
| 13 | Media | IDOR | `src/app/app/proyectos/actions.ts` (`toggleChecklistItemAction`) | Marca ítems de checklist de proyectos de otro condominio | ✅ Corregido |
| 14 | Media | IDOR | `src/app/portal/asambleas/actions.ts` (`castBallot`) | Un residente puede votar en una asamblea de otro condominio de la misma empresa | ✅ Corregido |
| 15 | Media | Exposición | `src/app/documento/[id]/page.tsx` | Estados de cuenta/certificaciones visibles por cualquier rol (incl. `seguridad`) sin validar condominio | ✅ Corregido |
| 16 | Media | Exposición | `src/app/app/reportes/*` | Reporte de morosidad consolida **toda la empresa**, sin recortar por condominio asignado | ✅ Corregido |
| 17 | Media | DoS lógico | `src/lib/services/demo-cleanup.ts` (`recolectarArbol`) | Recorrido de carpetas sin protección contra ciclos → riesgo de loop infinito si hay datos corruptos | ✅ Corregido |
| 18 | Media | Headers | `next.config.js`, `vercel.json` | Sin CSP / `X-Frame-Options` / HSTS → clickjacking posible | ✅ Corregido |
| 19 | Baja-Media | DoS lógico | `src/app/api/cron/route.ts` | Si un job falla, cualquier `admin_owner` puede reintentar el proceso completo repetidamente | ✅ Corregido |
| 20 | Media | Costo / abuso | Asistentes de IA (`legal-assistant.ts`, etc.) | Sin límite de longitud/frecuencia por usuario → abuso de costo de API Anthropic | ✅ Corregido |
| 21 | Baja | Timing | `src/app/api/cron/route.ts` | Comparación de `CRON_SECRET` con `===` en vez de `timingSafeEqual` | ✅ Corregido |
| 22 | Baja | Higiene | `src/lib/services/document-requests.ts` | Dos consultas usan `prisma` crudo en vez de `withTenantContext` (hoy no explotable, frágil a futuro) | ✅ Corregido |
| 23 | Baja (mitigado→reforzado) | DoS lógico | `pdf-lib` + `src/lib/image-safety.ts` | Bug conocido de `pdf-lib` (bucle infinito con PNG corrupto) ya mitigado en todos los sitios actuales; frágil si se añade un nuevo generador de PDF sin repetir la validación | ✅ Reforzado |

> **Actualización 2026-08-11 (segunda pasada, misma noche):** los 14
> hallazgos restantes (#10 a #23) también están corregidos. Decisiones
> confirmadas con el usuario antes de tocar código: #10 (bypass de
> `master`) se restringe — no era intencional; #16 (reportes) se recorta
> por condominio asignado — no era intencional. El resto son fixes
> técnicos directos, sin ambigüedad de producto. Detalle:
> - **#10-14 (IDOR/acceso):** mismo patrón `condoOf*()` + `allowsCondo`
>   que el resto del código — se agregaron `condoOfProjectChecklistItem`,
>   `condoOfSupervisor` a `entity-scope.ts`, y `castBallot` ahora resuelve
>   el condominio real de la votación dentro de la misma transacción.
> - **#15:** `/documento/[id]` ahora exige `requirePanel({module:
>   '/app/emision-documentos', condominiumId})` para cualquier rol que no
>   sea `condomino` — coherente con que esa misma acción de emisión ya
>   excluía a `contador`/`seguridad`.
> - **#16:** `reports.ts` (las 4 funciones) y la pantalla/exportación de
>   Reportes ahora aceptan `condoIds` opcional, poblado con
>   `listCondominiumsForSession(session)` — de paso se corrigió el mismo
>   hueco en "Explicar con IA" de Reportes, que no era parte de la lista
>   original pero comparte el mismo dato.
> - **#17:** `recolectarArbol` ahora tiene la misma protección `Set`/seen
>   contra ciclos que ya tenía `orderFoldersDeepestFirst`.
> - **#18:** `next.config.js` agrega `headers()` con `frame-ancestors
>   'none'` + `X-Frame-Options: DENY` + `X-Content-Type-Options` +
>   `Referrer-Policy` + HSTS. Deliberadamente SIN una CSP de
>   `script-src`/`style-src` completa: la app usa `style={{...}}` inline
>   en muchos componentes y bloquearlo sin revisar pantalla por pantalla
>   podía romper la interfaz sin forma de probarlo todo de antemano.
> - **#19 y #21:** `/api/cron` ahora compara `CRON_SECRET` con
>   `crypto.timingSafeEqual` y frena reintentos manuales (no los del
>   propio `CRON_SECRET`) a 10 por 10 minutos vía `rate-limit.ts`.
> - **#20:** los 5 puntos de entrada a la IA (legal, administrativo,
>   financiero, comunicados, explicar reportes) ahora limitan longitud
>   (~800 caracteres) y frecuencia (20/10min por usuario) vía
>   `rate-limit.ts`.
> - **#22:** `document-requests.ts` ya no usa `prisma` crudo en ningún
>   punto — `approveRequest` y `getIssuedDocument` pasan por
>   `withTenantContext`.
> - **#23:** nuevo `embedSafeImage()` en `image-safety.ts` — único punto
>   de entrada para incrustar una imagen en un PDF con pdf-lib; los 4
>   sitios que lo hacían (informe de caja chica, EEFF, notificación de
>   incumplimiento ×2) se migraron a usarlo, así que un generador de PDF
>   nuevo ya no puede "olvidarse" de validar antes de incrustar.
>
> Verificado: `tsc --noEmit` limpio, 318/318 tests en verde, `next build`
> de producción sin errores.
>
> **✅ Y ya está DESPLEGADO EN PRODUCCIÓN** (commit `d271721`, fusionado a
> `main` y desplegado con `vercel deploy --prod` — `readyState: READY`,
> alias `https://api.anexypro.com`). Verificado en vivo con `curl`: los 5
> headers nuevos del hallazgo #18 (`content-security-policy: frame-ancestors
> 'none'`, `x-frame-options: DENY`, `x-content-type-options: nosniff`,
> `referrer-policy`, `strict-transport-security`) están presentes en la
> respuesta real; `/documento/[id]` y `/app/reportes` redirigen a login sin
> sesión (307).
>
> **Con esto, los 23 hallazgos de la auditoría están corregidos y en
> producción.** Lo único que queda fuera del alcance de esta auditoría
> formal: CAPTCHA real en login/`/demo` (el freno por IP baja el techo del
> ataque pero no lo elimina si el atacante rota de IP) y una CSP completa
> de `script-src`/`style-src` (requiere revisar pantalla por pantalla el
> uso extensivo de `style={{...}}` inline antes de poder restringirlo sin
> riesgo).

---

## 1. CRÍTICO — `/api/cron` dispara procesos financieros de otras empresas

**`src/app/api/cron/route.ts:22-32`**
```ts
const session = await auth();
if (session?.user && ['admin_owner', 'master'].includes(session.user.role)) {
  return { ok: true, via: 'usuario' };
}
```
`runAllJobs()` no recibe `companyId`: recorre **todas** las empresas de la
plataforma (`forEachCompany`). El endpoint solo comprueba el *rol* de quien
llama, nunca que un `admin_owner` solo debería poder disparar procesos de
**su propia** empresa.

**Explotación:** el `admin_owner` de la Empresa X —un cliente normal— hace
`GET /api/cron?job=cobranza` (o `interes-moratorio`, `facturacion-automatica`)
y ejecuta ese proceso para **todas las demás empresas administradoras del
SaaS**, generando cargos e intereses reales sobre residentes que no tienen
ninguna relación con ese usuario.

**Arreglo:** que `admin_owner` solo pueda invocar `runJob`/`runAllJobs` con el
`companyId` de su propia sesión; la corrida multiempresa (sin `companyId`)
queda exclusiva para `CRON_SECRET` y `role === 'master'`.

**✅ Corregido.** `authorize()` ahora devuelve el `companyId` de sesión cuando
quien llama es `admin_owner` (y ningún `companyId` — alcance de toda la
plataforma — para `master`/`CRON_SECRET`). Ese `companyId` viaja como
`opts.companyId` a través de `runJob`/`runAllJobs` (`src/lib/jobs/runner.ts`)
y de ahí a `forEachCompany` (`src/lib/db.ts`), que ahora acepta filtrar por
una sola empresa. Los 6 jobs por-empresa (`interes-moratorio`,
`facturacion-automatica`, `gastos-recurrentes`, `contratos`, `cobranza`,
`informe-mensual`, `seguimiento-incumplimientos`) quedan acotados
automáticamente. Los dos jobs que NO se pueden acotar a una empresa
(`demo-vencidos`, `salud`/`system-health`) se marcaron `scope: 'plataforma'`
y quedan reservados a `master`/`CRON_SECRET` — un `admin_owner` que los pida
por nombre recibe 403, y si pide "todos los jobs" se saltan en silencio (sin
contar como error). La clave de idempotencia (`JobRun.runKey`) incorpora el
`companyId` cuando la corrida está acotada, para que una corrida de una sola
empresa no marque como "ya hecho" el día completo y bloquee la corrida real
de toda la plataforma (o al revés).

---

## 2-3. ALTO — Fuerza bruta y password spraying sin mitigar

- **No hay ninguna librería de rate limiting** instalada (`package.json` sin
  upstash/redis/express-rate-limit), **ni CAPTCHA**, y la app **nunca lee la
  IP del cliente** (`grep` de `x-forwarded-for` sin resultados en todo `src/`).
- El único freno existe en `src/lib/auth.ts:37-56`: máximo 8 intentos
  fallidos en 15 minutos **por cuenta** (`userId`), bien implementado con
  comparación de tiempo constante contra un hash señuelo para no filtrar si
  el correo existe.
- **Lo que falta:** un atacante que prueba **una** contraseña común contra
  miles de correos distintos (password spraying) nunca llega a los 8 intentos
  en ninguna cuenta individual — el freno no lo detecta. Tampoco hay límite
  global ni por IP, así que el mismo ataque de fuerza bruta clásica (muchas
  contraseñas contra una cuenta) puede repetirse indefinidamente cada 15
  minutos, 24/7, sin bloqueo permanente ni alerta.

**Arreglo:** agregar rate limiting por IP (p. ej. Upstash Ratelimit) en
`/api/auth/callback/credentials`, y considerar bloqueo temporal de cuenta más
agresivo o CAPTCHA tras varios ciclos de 8 intentos.

**✅ Corregido (sin CAPTCHA, ver nota).** Sin Redis/Upstash en este
despliegue, el freno se respaldó en Postgres: tabla nueva `RateLimitHit`
(`rate_limit_hits`, migración `20260815_rate_limit_hits`, **sin RLS a
propósito**, igual que `users`/`companies`) y el helper
`src/lib/rate-limit.ts` (`isRateLimited`/`registerHit`/`hitRateLimit` +
`clientIp()` a partir de `x-forwarded-for`/`x-real-ip`). En
`src/lib/auth.ts`, el `Credentials` provider ahora recibe también `request`
(Auth.js v5 lo pasa) y, ANTES de tocar la base, corta si esa IP ya acumuló
20 intentos fallidos en 15 minutos contra **cualquier cuenta** — esto es lo
que cierra el password spraying, porque no depende de qué correo se probó.
El freno por cuenta (8/15 min) sigue intacto y sin cambios de timing. De
paso se empezó a poblar el campo `AuthLog.ip` (existía en el esquema, nunca
se llenaba). **Pendiente real:** seguimos sin CAPTCHA — el freno por IP baja
mucho el techo del ataque pero no lo elimina si el atacante rota de IP.

---

## 4. ALTO — `/demo`: cupo saltable por condición de carrera, sin CAPTCHA

**`src/lib/services/demo.ts:45-71`** — el tope de 30 demos/hora es un
`count()` seguido de un `create()` **no atómicos**: sin `SELECT FOR UPDATE`
ni constraint de BD, 200 peticiones concurrentes pueden pasar el `count()`
antes de que ninguna haya insertado, superando el tope ampliamente. Cada
petición anónima ejecuta ~10 `bcrypt.hash(..., 12)` (deliberadamente caros) y
decenas de `INSERT`. Sin sesión, sin CAPTCHA.

**Explotación:** un script anónimo dispara peticiones concurrentes al abrir
una ventana horaria nueva, agota el cupo real (bloqueando demos legítimas) y
satura CPU/BD con los `bcrypt.hash` en paralelo.

**Arreglo:** constraint atómico o `SELECT FOR UPDATE` para el cupo, límite
por IP, y CAPTCHA.

**✅ Corregido (salvo CAPTCHA).** El chequeo autoritativo del cupo se movió
DENTRO de la transacción que crea la empresa, protegido por
`pg_advisory_xact_lock(hashtext('demo-creation-cap'))`: esa transacción es
corta (solo crea la empresa y el usuario dueño — el resto del sembrado de
datos sigue después, sin candado), así que serializar ahí no le cuesta nada
perceptible a un uso normal, pero cierra la ventana de carrera por completo
— la siguiente transacción en la cola ve el conteo ya actualizado, nunca una
foto vieja. El `count()` de fuera de la transacción se dejó como atajo NO
autoritativo (evita gastar los `bcrypt.hash` caros cuando ya es obvio que no
hay cupo). Además se agregó un tope por IP (`demo:<ip>`, máx. 3 por hora,
mismo `rate-limit.ts` del punto anterior) en `src/app/demo/actions.ts`,
antes de siquiera llamar a `createDemoCompany` — cierra que una sola IP
agote el cupo global ella sola. **Pendiente real:** sigue sin CAPTCHA.

---

## 5-7, 11-14. ALTO/MEDIO — IDOR intra-empresa (condominio a condominio)

> **Estado:** los tres de severidad ALTA (5, 6, 7 — documentos, pago de
> gastos, cierre de expedientes) están **✅ corregidos**, ver el detalle al
> final de esta sección. Los cuatro de severidad MEDIA (11-14 — supervisor,
> cobranza, proyectos, asambleas) **siguen pendientes**: no eran parte del
> lote que se pidió corregir en esta pasada.

Patrón repetido: la Server Action valida que el usuario tenga acceso al
`condominiumId` que **el propio cliente declaró** en el formulario, pero
nunca cruza ese id contra el condominio **real** de la entidad que va a
mutar (`expenseId`, `caseId`, `itemId`, `voteId`, `requestId`...). El resto
del código ya tiene el helper correcto (`condoOf*` en
`src/lib/services/entity-scope.ts`) — estos módulos simplemente no lo
llamaron:

- **`emision-documentos/actions.ts`** — `guard()` no recibe ni valida
  `condominiumId` en absoluto; un supervisor puede aprobar/rechazar
  solicitudes y reescribir plantillas oficiales de cualquier condominio de
  la empresa.
- **`finanzas/gastos/actions.ts` → `payExpenseAction`** — valida el
  `condominiumId` declarado, no el condominio real del `expenseId`.
- **`incumplimientos/actions.ts` → `closeCaseAction`** — cierra expedientes
  sin resolver el condominio real del `caseId` (las funciones hermanas del
  mismo archivo sí lo hacen).
- **`condominios/actions.ts`** (asignar/quitar supervisor) — depende solo de
  RLS, sin segunda verificación de aplicación (inconsistente con el resto).
- **`finanzas/cobranza/actions.ts` → `logActionAction`** — no cruza
  `propertyId` contra `condominiumId` (la función hermana `listActionsAction`
  sí lo hace, en el mismo archivo).
- **`proyectos/actions.ts` → `toggleChecklistItemAction`** — no ata el
  `itemId` al `projectId` validado.
- **`portal/asambleas/actions.ts` → `castBallot`** — no valida que el
  `voteId` pertenezca al condominio del residente que vota (afecta
  integridad del conteo de una asamblea, no solo lectura).

**Arreglo común:** en cada uno, resolver el condominio real de la entidad
recibida (`condoOfExpense`, `condoOfCase`, `condoOfChecklistItem`,
`condoOfAssemblyTopic`, etc. — algunos ya existen en `entity-scope.ts`, otros
hay que añadirlos) y compararlo con `canAccessCondo`/`allowsCondo` antes de
mutar, igual que ya hacen los módulos hermanos.

**✅ Corregidos los 3 de alta severidad:**
- **`emision-documentos/actions.ts`** — se agregó `condoOfDocumentRequest()`
  a `entity-scope.ts`. `approveRequestAction` y `rejectRequestAction` ahora
  resuelven el condominio real de la solicitud DESDE el `requestId` (no de un
  campo del formulario) y lo comprueban con `allowsCondo()` antes de aprobar
  o rechazar. `saveTemplateAction` (que sí necesita recibir `condominiumId`
  del formulario, porque la plantilla puede no existir aún) ahora valida ese
  id con `allowsCondo()` antes de guardar.
- **`finanzas/gastos/actions.ts` → `payExpenseAction`** — se agregó
  `condoOfExpense()` a `entity-scope.ts`. La acción ahora resuelve el
  condominio real del `expenseId` y lo compara contra el `condominiumId`
  declarado; si no coinciden, rechaza el pago antes de tocar el gasto.
- **`incumplimientos/actions.ts` → `closeCaseAction`** — se agregó
  `condoOfViolationCase()` a `entity-scope.ts`, mismo patrón que las
  funciones hermanas del archivo (`briefingAction`, `previewAction`,
  `issueViolationAction`): resuelve el condominio real del `caseId` y lo
  valida con `allowsCondo()` antes de cerrar el expediente.

`npx tsc --noEmit` queda limpio y los 318 tests existentes (incluido
`guard.test.ts`) siguen en verde después de estos tres cambios.

Los hallazgos 11-14 (asignar/quitar supervisor, `logActionAction` de
cobranza, `toggleChecklistItemAction` de proyectos, `castBallot` de
asambleas) **no se tocaron** — quedan para una próxima pasada.

---

## 8. ALTO — Enumeración de usuarios por timing en "olvidé mi contraseña"

**`src/app/recuperar/actions.ts:17-57`** — la respuesta es siempre el mismo
mensaje neutro (correcto, a propósito), pero **el tiempo de respuesta no se
iguala**: si el correo no existe, retorna casi de inmediato; si existe,
además hace `await sendEmail(...)` (llamada de red al proveedor SMTP), que
tarda notablemente más. Sin límite de frecuencia, un atacante puede medir
el tiempo de respuesta para una lista de correos candidatos y deducir cuáles
están registrados — justo lo que el mensaje neutro pretendía evitar.

**Arreglo:** despachar el envío de correo de forma asíncrona sin esperarlo
(o igualar el tiempo con un delay artificial), y agregar rate limiting al
endpoint.

**✅ Corregido.** `sendEmail(...)` ya no se espera (`await`) en el camino de
respuesta — se dispara y sigue, con su error atrapado y registrado en el log
del servidor si falla. La rama de "correo no configurado" (que antes SOLO
aparecía cuando la cuenta existía, un distintivo tan claro como decirlo
directo) también se movió al log del servidor en vez de a la respuesta. Se
agregó además un tope por IP (`recuperar:<ip>`, máx. 8 por 15 minutos, mismo
`rate-limit.ts`) que de paso cierra el bombardeo de correos reales a una
víctima repitiendo el envío.

---

## 9. ALTO — Importación de Excel sin límite de filas

**`src/lib/services/import-excel.ts`** — no hay límite de filas ni de
tamaño; el propio comentario del código admite que 95 filas ya generan
cientos de queries y obligó a subir el timeout de la transacción a 180s. Un
archivo de decenas de miles de filas mantendría una conexión de Postgres
bloqueada varios minutos; repetir la carga en paralelo agotaría el pool de
conexiones para **toda la plataforma** (no solo esa empresa).

**Arreglo:** rechazar archivos con más de ~500-1000 filas, o convertir el
procesamiento por fila en *bulk inserts* fuera de una única transacción larga.

**✅ Corregido.** Se agregó un tope de 1000 filas (`MAX_FILAS` en
`import-excel.ts`): un archivo con más filas se rechaza con un mensaje claro
ANTES de abrir la transacción larga, sin tocar la base.

---

## 10. MEDIA-ALTA — `repositorio/actions.ts`: bypass total para `master`

**`src/app/app/repositorio/actions.ts:28`**
```ts
if (session.user.role !== 'master' && !(await canAccessCondo(session, condominiumId))) return null;
```
El rol `master` queda sin ninguna restricción de condominio/empresa en esta
acción de **panel administrativo normal** (no el panel `/master` de
plataforma) para subir, borrar y renombrar documentos. Si no es una decisión
de soporte documentada, es acceso de escritura no auditado a documentos de
cualquier empresa cliente.

**Acción:** confirmar con el equipo si es intencional; si no, aplicar el
mismo `canAccessCondo` también a `master` aquí (el panel `/master` ya tiene
sus propias rutas para tareas de plataforma).

---

## 15-16. MEDIA — Exposición de datos financieros por falta de recorte de condominio

- **`/documento/[id]`** — solo restringe por condominio al rol `condomino`;
  cualquier otro rol autenticado de la empresa (incluido `seguridad`, que por
  diseño no debería ver finanzas) puede abrir el estado de cuenta de
  cualquier condominio si conoce/adivina el id.
- **`/app/reportes`** — el reporte de morosidad consolida todos los
  condominios de la empresa sin recortar por los condominios asignados a un
  `admin_staff`/supervisor, a diferencia del resto del panel. Puede ser
  intencional (reporte gerencial), pero conviene confirmarlo porque expone
  morosidad individual de residentes de condominios que el supervisor no
  administra.

---

## 17, 19, 23. Bugs de loop / recursos

- **`recolectarArbol`** (`demo-cleanup.ts`) recorre `StorageFolder` por
  `parentId` sin protección contra ciclos, a diferencia de la función
  hermana `orderFoldersDeepestFirst`, que sí tiene un `Set` de `seen`
  documentado exactamente para este caso. Si algún día hay datos corruptos
  con un ciclo en `parentId`, este `while` quedaría colgado indefinidamente.
  **Arreglo:** replicar la misma protección.
- **`/api/cron`** — si un job termina en error, cualquier `admin_owner`
  puede reintentarlo repetidamente disparando el proceso completo para todas
  las empresas cada vez (ligado también al hallazgo #1).
- **`pdf-lib`** tiene un bug conocido de bucle infinito con PNG corrupto; ya
  está mitigado en todos los generadores de PDF actuales
  (`src/lib/image-safety.ts`), pero es frágil: cualquier generador de PDF
  nuevo que olvide llamar `isSafePng`/`isSafeJpeg` antes de `embedPng`
  reintroduce el cuelgue total del proceso.

---

## 18, 20-22. Barrido general

- **Sin headers de seguridad** (`next.config.js`/`vercel.json` no definen
  `headers()`): falta CSP, `X-Frame-Options`, HSTS, `Referrer-Policy` —
  habilita clickjacking. Solo dos rutas de descarga setean
  `X-Content-Type-Options` manualmente.
- **Asistentes de IA** (legal, administrativo, financiero, informes,
  comunicados) requieren sesión (no explotable anónimamente), pero no todos
  limitan la longitud de la pregunta ni hay límite de frecuencia por usuario
  — abuso de costo de la API de Anthropic por una cuenta autenticada
  (incluida una cuenta demo gratuita).
- **`CRON_SECRET`** se compara con `===` en vez de
  `crypto.timingSafeEqual` (inconsistente con `storage-links.ts`, que sí lo
  usa). Riesgo bajo en la práctica.
- **`document-requests.ts`** usa `prisma` crudo en dos consultas en vez de
  `withTenantContext` — hoy no explotable porque el `where` ya filtra por
  `companyId` y RLS está forzado, pero es un patrón fuera del contrato
  documentado en `src/lib/db.ts`, frágil ante un refactor futuro.

**Sin hallazgos** en: secretos hardcodeados, inyección SQL en código de
aplicación (todo `$queryRaw` usa tagged templates o parámetros posicionales),
path traversal en almacenamiento de archivos (`resolveSafe` bien
implementado, nombres aleatorios en disco, `Content-Type` de descarga
derivado de whitelist por extensión, no del MIME declarado por el cliente),
mass assignment en Server Actions, `dangerouslySetInnerHTML`/`eval`, ni
tool-calling de IA con efectos secundarios (los asistentes son de solo
generación de texto, sin `tools` en las llamadas a Anthropic).

---

## Recomendación de orden de corrección

1. ~~**Hoy:** #1 (`/api/cron` multiempresa)~~ — **✅ hecho.**
2. ~~**Esta semana:** #5, #6, #7 (IDOR intra-empresa de alto impacto) y #4
   (condición de carrera en `/demo`)~~ — **✅ hecho.**
3. ~~**Antes de escalar tráfico:** #2/#3 (rate limiting de login) y #9
   (límite de filas en importación Excel)~~ — **✅ hecho.**
4. **Cuando haya tiempo (pendiente):** el resto de hallazgos MEDIA/BAJA — #10
   (bypass de `master` en repositorio), #11-14 (IDOR medios: supervisor,
   cobranza, proyectos, asambleas), #15-16 (exposición de datos financieros
   sin recorte de condominio), #17 (loop en `recolectarArbol`), #18 (headers
   de seguridad HTTP), #19-20 (reintento de cron, abuso de costo de IA), y
   #21-23 (comparación no timing-safe del `CRON_SECRET`, `prisma` crudo en
   `document-requests.ts`, fragilidad de `pdf-lib`). Son defensa en
   profundidad o casos de esquina de bajo impacto inmediato — no se tocaron
   en esta pasada.

## Verificación de esta pasada

- `npx tsc --noEmit -p tsconfig.json` → limpio.
- `npx vitest run` → 318/318 tests en verde (24 archivos), sin cambios en los
  tests existentes.
- Migración nueva `prisma/migrations/20260815_rate_limit_hits/` aplicada
  contra la base local y `prisma generate` corrido — el modelo
  `RateLimitHit` ya está disponible en el cliente de Prisma.
- **✅ Desplegada también a producción (2026-08-11, misma noche).**
  `vercel env pull` no puede traer `DATABASE_URL`/`DIRECT_URL` de producción
  (están marcadas "Encrypted" en el proyecto de Vercel — ni el dueño de la
  cuenta las puede leer de vuelta por CLI, es una restricción de la
  plataforma, no un bug). Se resolvió con un `git worktree` aislado
  (`fix/rate-limit-hits-migration`, commits `b49adc3` y `60a25f8`) que
  contiene ÚNICAMENTE la migración + el modelo `RateLimitHit` en
  `schema.prisma` — nada del resto de cambios pendientes en `main` — y se
  desplegó directo a producción con `vercel deploy --prod` desde ese
  worktree. Vercel corrió `vercel-build` con las credenciales reales del
  lado suyo (nunca expuestas a este chat ni al CLI local). De paso se
  encontró y corrigió un problema real: `scripts/verificar-bd.ts` tiene una
  lista explícita de tablas sin RLS a propósito (`SIN_RLS_A_PROPOSITO`,
  donde ya viven `companies`/`users`) y `rate_limit_hits` no estaba —
  el primer intento de deploy falló la verificación por eso (el build no
  llegó a promoverse; producción NO quedó en un estado roto en ningún
  momento). Se agregó `rate_limit_hits` a esa lista y se redesplegó: build
  `READY`, alias `https://api.anexypro.com` actualizado, verificado con
  `curl` (200 en `/login`). El worktree temporal ya se eliminó; la rama
  `fix/rate-limit-hits-migration` queda local, sin pushear a GitHub, como
  registro de lo que se desplegó — el resto de los fixes de hoy sigue sin
  commitear en `main`, tal como se decidió.
