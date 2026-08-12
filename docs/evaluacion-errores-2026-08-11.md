# Evaluación total del sistema — errores (11 de agosto de 2026, segunda pasada)

Con el trabajo del día ya commiteado y desplegado (feature completas + auditoría
de seguridad de 23 hallazgos, ver `docs/auditoria-seguridad-2026-08-11.md` y
`docs/tareas-pendientes-2026-08-11.md`), se pidió otra evaluación total para
encontrar errores — esta vez **no de seguridad/control de acceso**, sino de
lógica de negocio, robustez e infraestructura.

**Metodología:** 3 revisiones independientes en paralelo (lógica y cálculo /
robustez y manejo de errores / infraestructura y consistencia de datos) más
una verificación en vivo en el navegador contra un build de producción local
(`npm run build:local` + `npm run start:local`, puerto 3101 — nunca contra
producción real). Base: `tsc --noEmit` limpio, 318/318 tests, `npm run
db:verify` 11/11, `git status` limpio antes de empezar.

**Verificación en vivo:** login, dashboard, Reportes (financiero y
morosidad), Emisión de Documentos + visor de documento, Incumplimientos,
Proyectos (kanban) — todo renderiza sin errores de consola con `admin_owner`.
Confirma que los fixes de seguridad de hoy no rompieron el flujo normal.

> **Actualización 2026-08-11 (tercera pasada) — los 3 hallazgos urgentes ya
> están corregidos.** Detalle completo en la sección de cada uno más abajo.
> Resumen: `next-auth`/`@auth/core`/`@auth/prisma-adapter` actualizados (las
> 2 CVE críticas ya no aparecen en `npm audit`); `xlsx` reemplazado por la
> build oficial 0.20.3 del propio CDN de SheetJS (ya no publican a npm desde
> la 0.18.5, y no hay fix ahí); `runner.ts` con reclamo atómico
> (`INSERT...ON CONFLICT...WHERE`) verificado con una prueba real de
> concurrencia (5 llamadas paralelas → exactamente 1 reclama); y
> `late-interest.ts` con `timeout`/`maxWait` explícitos. `tsc`, 318 tests,
> `db:verify` 11/11 y una prueba funcional real de lectura/escritura de
> `.xlsx` (con acentos y ñ) — todo en verde antes de desplegar.
>
> **✅ Y ya está DESPLEGADO EN PRODUCCIÓN** (commit `81cf1a9`, `vercel deploy
> --prod` → `readyState: READY`, alias `https://api.anexypro.com`).
> Verificado en vivo contra la producción real: `/login` → 200,
> `/api/auth/providers` responde con normalidad (confirma que `next-auth`
> actualizado sigue sirviendo el flujo de credenciales), `/api/cron` sin
> sesión sigue redirigiendo a login (307, no quedó abierto).

---

## Resumen priorizado

| # | Severidad | Área | Archivo | Problema | Estado |
|---|---|---|---|---|---|
| 1 | **Crítica** | Dependencias | `next-auth`/`@auth/core` | 2 CVE críticas: fallos de configuración pueden dejar pasar auth en vez de bloquear; bypass de normalización de email por homoglifos | ✅ Corregido |
| 2 | Alta | Dependencias | `xlsx` 0.18.5 | Prototype Pollution + ReDoS, **sin parche disponible** — confirmado explotable vía `import-excel.ts` (archivos subidos por usuario) | ✅ Corregido |
| 3 | Alta | Dependencias | `next` 14.2.35 | ~19 avisos acumulados (DoS, SSRF en Server Actions, bypass de Middleware con i18n) — requiere salto a Next 16 | Pendiente (fuera de alcance de esta pasada) |
| 4 | Alta | Condición de carrera | `src/lib/jobs/runner.ts` (`runJob`) | El propio mecanismo de idempotencia de los jobs tiene TOCTOU — dos disparos casi simultáneos de `/api/cron` pueden duplicar el cobro de interés moratorio | ✅ Corregido |
| 5 | Alta | Transacción larga | `src/lib/services/late-interest.ts` | Sin `timeout` explícito — mismo bug ya confirmado en producción (`import-excel.ts`) con muchos cargos vencidos | ✅ Corregido |
| 6 | Alta | Rendimiento | `src/lib/services/security.ts` (`getSecurityLog`) | Trae el historial COMPLETO de ingresos/paquetes/incidentes sin `take` ni filtro de fecha — mismo bug ya corregido en `visits.ts`, no replicado acá | Pendiente |
| 7 | Media | Condición de carrera | `src/lib/services/demo.ts` (`createMasterDemoCompany`) | Mismo patrón que `createDemoCompany` ya protege con advisory lock, pero esta variante (demos para prospectos reales) no lo tiene | Pendiente |
| 8 | Media | Condición de carrera | `src/lib/services/collections.ts` (`createPaymentPlan`) | Sin constraint único — dos aprobaciones casi simultáneas pueden crear 2 convenios "vigentes" para la misma filial | Pendiente |
| 9 | Media | Fallo silencioso | `src/lib/services/subscriptions.ts` (`canCreateCondominium`) | Ante un error transitorio de BD, falla ABIERTO (bypass silencioso del límite del plan) | Pendiente |
| 10 | Media | Fallo silencioso | `src/lib/services/storage.ts` (`renameObject`) | Si el proveedor no puede renombrar el archivo real, el nombre se actualiza en la BD igual — queda desincronizado para siempre | Pendiente |
| 11 | Media | Fecha/zona horaria | `src/app/app/reportes/violations-tab.tsx` | Filtro de fechas sin `Z` — recorta ~6 horas del día en hora de Costa Rica; un incumplimiento reportado de noche desaparece del reporte de ese día | Pendiente |
| 12 | Media | Fecha/zona horaria | `src/app/app/finanzas/actions.ts` (`generateBillingAction`) | Reintroduce el patrón `new Date(...T00:00:00)` sin `Z` que ya causó bugs de facturación en otro punto del código | Pendiente |
| 13 | Media | Consistencia de datos | `src/lib/services/demo.ts:507` | `generateOrdinaryBilling(..., new Date())` en vez de `periodStart()` — rompe el invariante "período = día 1 UTC" para demos | Pendiente |
| 14 | Media | Documentación | `docs/tareas-pendientes-2026-08-11.md` | Dice que los seeds de condominio nuevo no son automáticos — **ya se corrigió** 3h21min antes de escribirse esa línea (commit `76a7059`), nunca se actualizó | ✅ Corregido (misma nota) |
| 15 | Media-Baja | Fallo silencioso | `src/lib/services/user-provisioning.ts` | Rollback de alta de usuario en 2 pasos no atómicos, con errores silenciados — puede dejar un `User`/`Person` inconsistentes | Pendiente |
| 16 | Baja-Media | Rendimiento | 9 archivos más (ver detalle) | `findMany` sin `take` sobre tablas de crecimiento continuo (cargos, pagos, gastos, comunicados, lecturas de agua, conciliación bancaria, fondo de reserva, caja chica) | Pendiente |
| 17 | Baja | Condición de carrera | `src/lib/services/document-requests.ts` (`requestDocument`) | Sin constraint único — doble clic puede duplicar una solicitud de documento | Pendiente |
| 18 | Baja | Cálculo | `src/lib/domain/aging.ts` | Redondeo inconsistente entre el total por fila y el total agregado — ruido de punto flotante visible en el Excel de cobranza | Pendiente |
| 19 | Baja | Proceso | `prisma/migrations/` | 2 migraciones nombradas con fecha anterior a cuando realmente se escribieron/aplicaron — sin romper nada hoy, pero riesgo de despliegue futuro si alguna vez hay dependencia cruzada real | Pendiente |
| 20 | Baja | Rendimiento | `src/lib/services/reports.ts` (`getDelinquencyReport`) | Las consultas de `charges`/`allocations` no se filtran por `condoIds` (a diferencia de `properties`, que sí) — no es fuga de datos (el resultado final igual se filtra), pero desperdicia trabajo que crece con la antigüedad de la empresa | Pendiente |

---

## 1-3. CRÍTICA/ALTA — Vulnerabilidades de dependencias

`npm audit --omit=dev` (excluye lo que no se despliega) encontró **2 críticas y
5 altas** en paquetes que sí corren en producción:

- **`next-auth`/`@auth/core`** (crítica ×2): "Configuration errors can cause
  existence-based auth checks to fail open" + bypass de normalización de
  email por homoglifos. Justo el área auditada hoy — un fallo de
  configuración que deja pasar autenticación en vez de bloquearla es grave.
  `fixAvailable: true` (requiere actualizar `@auth/core`; revisar el
  changelog de la beta antes de saltar, sigue en beta).
- **`xlsx` 0.18.5** (alta, **sin parche disponible** en el registro): Prototype
  Pollution + ReDoS. **Confirmado explotable, no solo teórico**:
  `src/lib/services/import-excel.ts:113` hace `XLSX.read()` sobre archivos
  `.xlsx` subidos por el usuario (importación de residentes/propiedades, y
  extractos bancarios en conciliación). Un archivo malicioso llega directo
  al parser vulnerable. Sin fix disponible del proveedor — las opciones son
  migrar a otra librería (`exceljs`, que sí mantiene parches) o aceptar el
  riesgo con validación adicional de origen del archivo.
- **`next` 14.2.35** (alta, ~19 avisos acumulados): DoS en Server
  Actions/Image Optimizer, SSRF en Server Actions y rewrites, XSS con
  nonces CSP, bypass de Middleware con i18n. El fix requiere Next 16
  (salto mayor, no trivial).

**Recomendación:** priorizar `next-auth`/`@auth/core` (crítica, fix
disponible) y evaluar reemplazar `xlsx` dado que no tiene parche. `next` 16
es un proyecto aparte, no una tarea de una tarde.

**✅ Corregido (#1 y #2, no #3).**
- `next-auth` `5.0.0-beta.20` → `5.0.0-beta.32`, `@auth/prisma-adapter`
  `2.4.2` → `2.11.3` (arrastra `@auth/core` `0.41.2` → `0.41.3`). Las 4 CVE
  (2 críticas, 1 alta, 1 moderada) ya no aparecen en `npm audit --omit=dev`.
  Verificado con login real de punta a punta contra un build de producción
  local: sesión creada, `/api/auth/session` responde con el usuario y rol
  correctos, navegación entre módulos protegidos funciona igual que antes.
- `xlsx` `0.18.5` (npm registry, sin parche) → `0.20.3` instalado desde el
  CDN oficial de SheetJS (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`)
  — confirmado en su propia documentación como la versión vigente que
  recomiendan instalar así, porque dejaron de publicar a npm después de la
  0.18.5. Prototype Pollution y ReDoS ya no aparecen en `npm audit`.
  Verificado con una prueba funcional real: escribir un `.xlsx` con
  `XLSX.utils.json_to_sheet`/`XLSX.write` (mismo patrón que las rutas de
  exportación) y leerlo de vuelta con `XLSX.read`/`sheet_to_json` (mismo
  patrón que `import-excel.ts`), incluyendo texto con acentos y ñ — los
  datos leídos coinciden exactamente con los escritos.
- **`next` 14.2.35 (#3) sigue pendiente, a propósito**: el fix requiere
  Next 16 (salto mayor), justo el framework donde hoy se implementó la CSP
  con nonce por petición (`src/middleware.ts`) — no es prudente mezclar un
  upgrade mayor de Next con lo que se acaba de estabilizar, sin una sesión
  dedicada solo a probar esa migración.

---

## 4. ALTA — El propio mecanismo de idempotencia de los jobs tiene una condición de carrera

**`src/lib/jobs/runner.ts:90-113`** — `runJob` hace `findUnique` (¿ya corrió
hoy?) y después `upsert` (marca "corriendo") en pasos separados, sin ningún
candado. `createDemoCompany` ya resolvió exactamente este problema con
`pg_advisory_xact_lock` (ver `services/demo.ts:135`) — `runJob` no lo tiene.

**Escenario real:** dos llamadas casi simultáneas a `/api/cron` (reintento
del proveedor de cron por timeout, o un "ejecutar ahora" manual que se cruza
con el disparo programado) para el mismo día → ambas pasan el chequeo antes
de que ninguna termine de marcarse como "corriendo" → **el interés moratorio
se cobra dos veces** sobre el mismo cargo. El propio comentario de
`late-interest.ts` llama a esto "un problema legal, no un bug".

**✅ Corregido.** `runJob` ahora reclama la corrida con una sola sentencia
`INSERT INTO job_runs ... ON CONFLICT (job_name, run_key) DO UPDATE ...
WHERE ... RETURNING id` — atómica en Postgres, sin la ventana entre "leer"
y "escribir" que tenía el `findUnique`+`upsert` separados. Mismas reglas de
antes (ok = no se repite, corriendo hace &lt;30 min = no se repite, corriendo
hace &gt;30 min = se considera abandonada y se puede reclamar). `force`
(reprocesar a mano) sigue con el `upsert` de siempre, sin cambios — es
intencional saltarse la protección cuando alguien lo pide explícitamente.
**Verificado con una prueba real de concurrencia** (no solo leyendo el
código): 5 llamadas disparadas en paralelo (`Promise.all`) contra la misma
clave sobre la base de datos real → exactamente 1 la reclamó, las otras 4
no hicieron nada; una clave ya marcada `ok` no se puede volver a reclamar;
una clave distinta sí. Script de prueba descartado después, no quedó en el
repo.

---

## 5. ALTA — Transacción larga sin `timeout` en interés moratorio (mismo bug ya visto)

**`src/lib/services/late-interest.ts`** — `applyLateInterestForCondo` abre
`withTenantContext` sin pasar `{ timeout }`, y adentro hace 3-5 consultas
secuenciales POR CADA cargo vencido. Con un condominio grande recién
activando `autoInterest` sobre cartera ya morosa, son cientos de queries
dentro de una transacción con el límite default de Prisma (5s) — **el mismo
mecanismo de falla que ya se confirmó en producción con `import-excel.ts`**
(que por eso ya tiene `{ timeout: 180_000 }`). Si corta a mitad, ese
condominio se queda sin intereses aplicados ese día, sin alerta, y puede
repetirse indefinidamente.

**✅ Corregido.** `applyLateInterestForCondo` ahora pasa
`{ timeout: 120_000, maxWait: 20_000 }` a `withTenantContext`, con un
comentario que explica por qué (mismo mecanismo de falla que
`import-excel.ts`). No se tocó la lógica de cálculo, solo el límite de
tiempo de la transacción — verificado que los 318 tests y `tsc` siguen en
verde.

---

## 6. ALTA — `getSecurityLog` trae el historial completo (mismo bug ya corregido en otro archivo, no replicado acá)

**`src/lib/services/security.ts:56,60,61`** — `visitCheckin.findMany`,
`package.findMany`, `incident.findMany` sin `where` de fecha ni `take`,
usado por la bitácora de seguridad (`/seguridad/bitacora`). El propio
`visits.ts` ya tiene un comentario explicando por qué se corrigió ahí
("la caseta... acababa moviendo el historial completo en cada vuelta") —
pero el fix no se aplicó a `security.ts`.

---

## 7-10, 15, 17. MEDIA/BAJA — Condiciones de carrera y fallos silenciados

Patrón repetido: un `findFirst`/`count` de "¿ya existe?" seguido de un
`create()`, sin constraint único de base ni candado que lo respalde:

- **`createMasterDemoCompany`** (demo.ts:357) — mismo patrón que
  `createDemoCompany` (que sí se protegió hoy con advisory lock), sin
  protección en esta variante para prospectos reales. Dos solicitudes
  casi simultáneas con el mismo correo pueden crear dos usuarios con el
  mismo email en dos empresas — el login por correo sin `companyId` deja
  el resultado no determinista.
- **`createPaymentPlan`** (collections.ts:220) — dos convenios "vigentes"
  para la misma filial si se aprueban casi al mismo tiempo.
- **`requestDocument`** (document-requests.ts:196) — doble clic puede
  duplicar una solicitud de documento (baja severidad, molesto no grave).

Y errores atrapados sin registrar que ocultan un fallo real:

- **`canCreateCondominium`** (subscriptions.ts:287) — si el `count()` falla,
  cae a `0`, y con eso el límite del plan queda sin aplicar exactamente
  cuando la base tuvo un problema.
- **`renameObject`** (storage.ts:701) — si el proveedor de almacenamiento no
  puede renombrar el archivo real, el nombre igual se actualiza en la BD.
- **`user-provisioning.ts:111`** — rollback de alta de usuario en dos pasos
  no atómicos, cada uno con su error silenciado.

---

## 11-13. MEDIA — Fechas y zona horaria

Tres casos del mismo patrón que el proyecto ya conoce y corrigió en varios
lugares (`fecha-local.ts`, `periodStart()`), pero que reaparece en código
más reciente:

- **`reportes/violations-tab.tsx`** — filtro sin `Z` recorta ~6 horas en
  hora de Costa Rica; un incumplimiento reportado de noche desaparece del
  reporte del día correcto.
- **`finanzas/actions.ts` → `generateBillingAction`** — usa
  `new Date(...T00:00:00)` sin `Z` en vez de `periodStart()`, que sí se usa
  dos líneas más abajo en el mismo archivo.
- **`demo.ts:507`** — siembra la facturación de una demo con `new Date()`
  en vez de `periodStart()`, rompiendo el invariante "período = día 1 UTC".

Ninguno se nota hoy porque Vercel corre en UTC — son exactamente el tipo de
bug que aparecería si algún día se define `TZ=America/Costa_Rica` sin antes
revisar esto (ya anotado como riesgo latente en `docs/tareas-pendientes`).

---

## 14. MEDIA — Documentación desactualizada, no bug de código

`docs/tareas-pendientes-2026-08-11.md` dice que los seeds de condominio
nuevo (catálogo de incumplimientos, categorías de activos) no son
automáticos — pero **ya se corrigió** (`createCondominium` llama a
`seedCondoCatalogs` automáticamente desde el commit `76a7059`, escrito 3h21
antes de que se escribiera esa línea del doc). El código está bien; el doc
miente. Se corrige abajo.

---

## 16, 20. BAJA — Rendimiento (`findMany` sin `take`)

172 `findMany` en `src/lib/services/*.ts`, 134 sin `take`. La mayoría son
inherentemente acotados (catálogos, configuración) y no son un problema.
Los que sí importan porque consultan tablas de crecimiento continuo en
rutas calientes, sin filtro de fecha:

`finance.ts` (`listPropertiesWithBalance`, usado en el dashboard financiero
principal) · `water.ts` (`getWaterBoard`) · `collections.ts`
(`getCollectionsView`, `CollectionAction`) · `expenses.ts` (`listExpenses`)
· `communications.ts` · `bank-reconciliation.ts` · `reserve-fund.ts` ·
`petty-cash.ts` · `reports.ts` (`getDelinquencyReport`, además sin filtrar
por `condoIds`).

Ninguno rompe nada hoy — son bases jóvenes. El riesgo crece con la
antigüedad real de cada condominio (años de cargos/pagos/gastos
acumulados).

---

## 18-19. BAJA — Cálculo y proceso

- **`aging.ts`** — el total por fila no se redondea (`round2`) igual que el
  total agregado, dejando ruido de punto flotante visible en el Excel de
  cobranza (ej. `188.64000000000001`).
- **Migraciones "backdatadas"**: `20260811_asset_categorias` y
  `20260811_catalogo_incumplimientos_base` se nombraron con la fecha de la
  sesión de trabajo, pero se escribieron/aplicaron horas después que las
  migraciones "20260812…14". Hoy no rompe nada (verificado desplegando
  desde una base vacía), pero es un riesgo de proceso si algún día hay una
  dependencia cruzada real entre migraciones nombradas fuera de orden.

---

## Lo que NO se encontró (verificado, no asumido)

- Interés moratorio, tarifa de agua escalonada, asignación de pagos: la
  aritmética es correcta, incluidos los bordes de cada tramo.
- Ninguna mezcla de monedas distintas en un mismo total.
- Ningún `JSON.parse` sin `try/catch`.
- Ningún `while(true)` ni recursión sin límite nuevo (aparte del ya
  corregido hoy en `demo-cleanup.ts`).
- Ningún índice de base de datos faltante en los modelos de alto volumen
  revisados — ya están todos, con comentarios explícitos de por qué.
- Ningún código muerto/huérfano en las carpetas de demo/agua agregadas hoy.
- Ninguna variable de entorno nueva de hoy (rate-limit, demo, agua) sin
  documentar en `.env.example`.
- Bug de encoding de nombres de archivo (el ya corregido hace días) NO se
  repite en ningún punto nuevo.

---

## Alcance no cubierto por esta pasada

- No se probó contra la base de datos de producción real, solo Postgres
  local (que sí refleja el mismo esquema, verificado).
- No se revisaron todas las rutas de `src/app` en busca de código muerto,
  solo las agregadas hoy.
- No se evaluó el esfuerzo de actualizar `next-auth`/`next`/reemplazar
  `xlsx` — solo se reporta que hace falta.
- La búsqueda de `null`/`undefined` no manejado se acotó a los 5 archivos
  de hoy (agua, demo, exportar, EEFF) — no se expandió a todo el repo.
