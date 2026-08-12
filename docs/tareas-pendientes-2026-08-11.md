# Tareas sin cerrar — evaluación del 11 de agosto de 2026

Barrido del estado real del proyecto (no solo la auditoría de seguridad):
control de versiones, base de datos, build, y los pendientes que ya
estaban anotados en auditorías/pruebas anteriores, verificados de nuevo
contra el código de hoy (varios de esos ya estaban resueltos aunque el
apunte viejo los seguía marcando pendientes — se corrige eso también).

**Estado verificado ahora mismo:** `tsc --noEmit` limpio, 318/318 tests en
verde, `next build` de producción termina sin errores. El código en sí
compila y pasa sus pruebas al 100%. Lo que falta para un "100% limpio" de
verdad no son errores de compilación — es un conjunto de decisiones y
huecos operativos, listados abajo por prioridad.

---

## 1. ✅ RESUELTO — Higiene de control de versiones

**`main` tiene 50 archivos modificados + 28 sin trackear, nunca commiteados.**
Esto es lo más urgente de resolver porque bloquea todo lo demás: no hay forma
de desplegar el resto de los fixes de seguridad de hoy, ni de saber qué del
trabajo ya hecho (demo, agua potable, EEFF, exportar reportes, categorías de
activos) está realmente terminado y listo para producción vs. a medio probar.

Lo que vive sin commitear ahora mismo incluye, al menos:
- Los 5 fixes de seguridad de hoy que **no** se desplegaron aparte (cron
  multiempresa, 3 IDOR, timing leak de `/recuperar`, límite de filas Excel) —
  solo se desplegó la migración de `rate_limit_hits`, aislada a propósito.
- Feature completa de "empresas demo" (`/demo`, ciclo de vida, purga,
  `usuarios-demo` en el panel master) — con pruebas, parece terminada.
- Cobro de agua potable (`domain/water.ts`, `services/water.ts`,
  `water-billing.tsx`) — con pruebas, verificado en vivo según memoria.
- Exportación de reportes/EEFF (`finanzas/exportar`, `finanzas/exportar-estado`,
  `contabilidad/eeff`, `descargar-reporte.tsx`, `status-cards.tsx`).
- Categorías de activos editables (`AssetCategoryOption`, migración
  `20260811_asset_categorias`) y catálogo default de incumplimientos.
- 5 migraciones de Prisma nuevas sin commitear (`20260811_demo_companies`
  hasta `20260815_rate_limit_hits`).

**✅ Resuelto.** El working tree se agrupó en 3 commits sobre la rama
`features-y-seguridad-2026-08-11` (agua potable · empresas demo · reportes
financieros/EEFF/línea presupuestaria/expediente de cobranza + auditoría de
seguridad), pusheada y fusionada a `main` (fast-forward, `b196c9f`). No se
intentó separar línea por línea los fixes de seguridad de las features que
comparten archivo (ver el commit `bd97821`) — el costo de la cirugía no se
justificaba dado que ambas partes ya estaban verificadas por separado.

---

## 2. ✅ RESUELTO — Los 5 fixes de seguridad de hoy sin desplegar

Desplegados a producción (`vercel deploy --prod`, deployment
`dpl_qCC5zmN1BvJBRRUKZmWC6u3EMHYN`, `readyState: READY`, alias
`https://api.anexypro.com` actualizado). Antes de desplegar se encontró y
corrigió un problema mellizo al de `rate_limit_hits`: `demo_history_entries`
(de la feature de demos, recién commiteada) tampoco estaba en la lista
`SIN_RLS_A_PROPOSITO` de `scripts/verificar-bd.ts` — se agregó en
`b196c9f` antes de desplegar, así que el build no volvió a fallar la
verificación como la vez anterior. Verificado con `curl`: `/login`,
`/demo`, `/recuperar` → 200; `/api/cron` sin sesión → redirige a login
(ya no es un endpoint abierto).

Con esto:
- `/api/cron` ya ata `admin_owner` a su propia empresa en producción.
- El freno de fuerza bruta/spraying del login está activo en producción.
- Los 3 IDOR intra-empresa (documentos, pago de gastos, cierre de
  expedientes) están corregidos en producción.
- El timing leak de `/recuperar` está cerrado en producción.
- El límite de filas de Excel está activo en producción.
- De regalo, todo el trabajo pendiente de features (demo, agua potable,
  reportes/EEFF, línea presupuestaria) también quedó desplegado — no había
  forma de separarlo sin la cirugía mencionada en el punto 1.

---

## 3. ✅ RESUELTO — 14 hallazgos restantes de la auditoría de seguridad

Del informe completo (`docs/auditoria-seguridad-2026-08-11.md`), hallazgos
#10 a #23 — **los 14 ya están corregidos**, con `tsc`/318 tests/`next build`
en verde. Antes de tocar código se confirmaron con el usuario las dos
decisiones de producto que hacían falta: #10 (bypass de `master`, no era
intencional → restringido) y #16 (reportes consolidados, no era intencional
→ recortado por condominio asignado). Detalle completo en el informe.

| # | Severidad | Cómo quedó |
|---|---|---|
| 10 | Media-Alta | ✅ `repositorio/actions.ts`: `master` ya no tiene bypass, pasa por `canAccessCondo` como cualquier otro rol |
| 11 | Media | ✅ `condominios/actions.ts`: segunda verificación en código (`allowsCondo` + `condoOfSupervisor`), ya no depende solo de RLS |
| 12 | Media | ✅ `logActionAction` cruza `propertyId` contra `condominiumId` con `condoOfProperty` |
| 13 | Media | ✅ `toggleChecklistItemAction` ata el ítem al condominio real del proyecto (`condoOfProjectChecklistItem`) |
| 14 | Media | ✅ `castBallot` resuelve el condominio real de la votación y lo compara contra el de la filial que vota |
| 15 | Media | ✅ `/documento/[id]` exige `requirePanel({module: '/app/emision-documentos', condominiumId})` para roles no-condómino |
| 16 | Media | ✅ `reports.ts` + pantalla/exportación/"Explicar con IA" de Reportes recortan por `listCondominiumsForSession` |
| 17 | Media | ✅ `recolectarArbol` con la misma protección `Set`/seen contra ciclos que `orderFoldersDeepestFirst` |
| 18 | Media | ✅ `next.config.js` → `headers()`: `frame-ancestors 'none'`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS (sin CSP de scripts/estilos completa, ver nota en el informe) |
| 19 | Baja-Media | ✅ `/api/cron` frena reintentos manuales a 10/10min (el disparo por `CRON_SECRET` no se frena) |
| 20 | Media | ✅ Los 5 puntos de entrada a la IA limitan longitud (~800 caracteres) y frecuencia (20/10min por usuario) |
| 21 | Baja | ✅ `CRON_SECRET` se compara con `crypto.timingSafeEqual` |
| 22 | Baja | ✅ `document-requests.ts` usa `withTenantContext` en las 2 consultas que quedaban con `prisma` crudo |
| 23 | Baja (reforzado) | ✅ `embedSafeImage()` centraliza la validación antes de `embedPng`/`embedJpg` en los 4 sitios que incrustan imágenes en un PDF |

Además, sin CAPTCHA real en login/`/demo` (el freno por IP de hoy baja el
techo del ataque pero no lo elimina si el atacante rota de IP).

---

## 4. MEDIA — Base de datos

- ~~**`db:verify` falla**: `demo_history_entries` sin RLS a propósito~~ —
  **✅ Resuelto** al desplegar el punto 2: se agregó a
  `SIN_RLS_A_PROPOSITO` antes del deploy, `db:verify` pasa las 11
  comprobaciones en local y en producción.
- **Documento de referencia de EEFF que Freddy dijo haber cargado** — no
  existe en `docs/`, `storage/` ni la base (buscado dos veces, 2026-08-09).
  El módulo se armó con contenido estándar; pedirlo si se quiere el formato
  exacto.
- **Seeds no automáticos para condominios nuevos**: `seed-violations.ts` y
  `seed-asset-categories.ts` hay que correrlos a mano — `services/condominiums.ts`
  no los dispara al crear un condominio. Hueco conocido, no nuevo.

---

## 5. MEDIA — Deuda técnica funcional (re-verificada hoy contra el código actual)

La auditoría del 5 de agosto dejó una lista de "otros pendientes"; al
re-verificar hoy, varios **ya están resueltos** (la nota vieja quedó
desactualizada) y otros siguen abiertos:

**Ya resueltos (la memoria vieja estaba desactualizada, no hace falta tocar):**
- ~~Barras laterales de ancho fijo, no colapsan en móvil~~ → `sidebar-shell.tsx`
  ya tiene el menú responsive (`lg:hidden`, overlay).
- ~~`bodySizeLimit` de 10 MB contradice los límites de 100/20 MB del código~~ →
  `next.config.js` ya tiene `bodySizeLimit: '100mb'`.
- ~~Sin límite de intentos de login~~ → corregido hoy (auditoría de seguridad).
- ~~Sin `error.tsx`/`not-found.tsx`~~ → según el propio informe del 5 de
  agosto esto se hizo esa misma jornada; la lista de pendientes no se
  actualizó después.

**Siguen abiertos (a re-confirmar con una pasada dedicada, no con grep rápido):**
- `findMany` sin `take` en varias consultas de listado — mejoró bastante
  desde el 126/147 original, pero no se puede afirmar el número exacto sin
  revisar cada uno; vale una pasada dedicada antes de escalar tráfico.
- El layout de `/app` sigue consultando la misma fila de `company` más de
  una vez por navegación.
- `/portal/visitas` corre la misma consulta pesada dos veces
  (`getResidentVisitAlerts` llama internamente a `listVisitsByProperty`).
- 19 modelos sin ningún `@@index` (todo el módulo de Asambleas, según el
  informe original).
- `Charge` sin índice por `status`, `Payment` sin índice por `condominiumId`.

---

## 6. BAJA — Riesgos operativos / de configuración

- **`TZ` en Vercel**: si alguna vez se define `TZ=America/Costa_Rica` sin
  antes corregir el manejo de fechas `@db.Date`, las fechas salen un día
  antes en estado de cuenta, reservas, libro diario, documento formal, y
  `generateOrdinaryBilling` factura el mes anterior con vencimiento ya
  pasado. Hoy Vercel corre en UTC (por eso no se nota) — **no definir `TZ`**
  sin resolver esto primero.
- `ANTHROPIC_API_KEY` vacía en el `.env` **local** (largo real: 2 caracteres,
  o sea `""`) — los asistentes de IA no van a responder en desarrollo local.
  En producción sí está configurada (`vercel env ls` la lista), así que no
  es un problema de producción, solo de este entorno de desarrollo.
- `app.anexypro.com` seguía "Invalid Configuration" en DNS de Hostinger la
  última vez que se tocó (conflicto con un registro A viejo que Hostinger no
  dejaba borrar) — la app sigue sirviéndose desde `api.anexypro.com`
  mientras tanto, así que no bloquea nada, pero quedó sin resolver.
- Confirmar si `CRON_SECRET` y el cron diario de `vercel.json` (`0 14 * * *`)
  ya están realmente disparando los procesos automáticos en producción —
  **buena noticia verificada hoy**: `CRON_SECRET` SÍ está configurada en
  Vercel (Preview y Production) y `vercel.json` SÍ tiene el cron programado.
  El pendiente de julio sobre esto parece resuelto; vale confirmar en la
  bitácora de `/master/estado` que corrió al menos una vez.
- Fase 6 de Finanzas (facturación electrónica) sigue aplazada hasta validar
  el criterio tributario con un contador — decisión de negocio, no técnica.

---

## Fuera del código (no bloquea "el programa", mencionado por completitud)

- Faltan 3 de los 4 videos de recorrido (Administradora, Residente,
  Seguridad) — solo existe el de supervisor. Guion listo en
  `presentacion/guiones-recorridos.md`.
- Confirmar la licencia web de la tipografía Articulat CF.

---

## Orden sugerido

1. **Decidir qué hacer con el working tree de `main`** (#1) — todo lo demás
   depende de esto.
2. Desplegar el resto de los fixes de seguridad de hoy (#2) una vez resuelto #1.
3. Agregar `demo_history_entries` a `SIN_RLS_A_PROPOSITO` (#4, un minuto) antes
   de que ese trabajo se despliegue.
4. Encarar los 17 hallazgos de severidad media/baja de la auditoría (#3) en
   una siguiente pasada, empezando por el #10 (bypass de `master`) y el #18
   (headers de seguridad — barato y de alto valor).
5. Pasada dedicada de rendimiento (`findMany` sin `take`, índices faltantes,
   consultas duplicadas) — #5, cuando haya tiempo, antes de escalar tráfico.
6. Resto (#6) — operativo, sin urgencia técnica.
