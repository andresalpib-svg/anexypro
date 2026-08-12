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

## 1. CRÍTICO — Higiene de control de versiones

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

**Decisión que hace falta tomar (no es mía):** ¿todo esto ya se probó y está
listo para salir junto, o hay partes a medio terminar? Sin esa respuesta no
se puede armar un commit responsable. Recomendación: revisar módulo por
módulo (probablemente ya lo hiciste, dado que hay pruebas y memoria de
verificación en vivo para casi todos), y luego un solo commit grande —o
varios por feature— a una rama, PR, y merge a `main` cuando estés conforme.

---

## 2. ALTO — Los 5 fixes de seguridad de hoy sin desplegar

Están en el working tree de `main`, no en producción todavía (a propósito,
para no mezclarlos con lo de arriba):
- `/api/cron` sigue permitiendo que un `admin_owner` dispare procesos de
  **todas** las empresas hasta que esto se despliegue.
- El freno de fuerza bruta/spraying del login vive en el código pero
  **no sirve de nada en producción sin este deploy** (la tabla ya existe,
  pero el código que la usa no está desplegado).
- 3 IDOR intra-empresa (documentos, pago de gastos, cierre de expedientes)
  siguen explotables en producción.
- El timing leak de `/recuperar` sigue vivo en producción.
- El límite de filas de Excel sigue sin aplicar en producción.

**Depende de #1** — no tiene sentido desplegar esto solo sin resolver primero
qué pasa con el resto del working tree.

---

## 3. ALTO — 17 hallazgos de la auditoría de seguridad, sin tocar

Del informe completo (`docs/auditoria-seguridad-2026-08-11.md`), hallazgos
#10 a #23, ninguno corregido todavía:

| # | Severidad | Qué falta |
|---|---|---|
| 10 | Media-Alta | `repositorio/actions.ts`: el rol `master` tiene bypass total de validación de condominio — confirmar si es intencional |
| 11 | Media | `condominios/actions.ts` (asignar/quitar supervisor): depende solo de RLS, sin segunda verificación de aplicación |
| 12 | Media | `finanzas/cobranza/actions.ts` (`logActionAction`): no cruza `propertyId` contra `condominiumId` |
| 13 | Media | `proyectos/actions.ts` (`toggleChecklistItemAction`): no ata el ítem al proyecto validado |
| 14 | Media | `portal/asambleas/actions.ts` (`castBallot`): un residente puede votar en una asamblea de otro condominio |
| 15 | Media | `/documento/[id]`: estados de cuenta visibles por cualquier rol (incl. `seguridad`) sin validar condominio |
| 16 | Media | `/app/reportes/*`: morosidad consolidada sin recorte por condominio asignado — confirmar con producto si es intencional |
| 17 | Media | `demo-cleanup.ts` (`recolectarArbol`): sin protección contra ciclos → riesgo de loop infinito |
| 18 | Media | Sin headers de seguridad HTTP (CSP, `X-Frame-Options`, HSTS) → clickjacking posible |
| 19 | Baja-Media | `/api/cron`: si un job falla, cualquier `admin_owner` puede reintentarlo indefinidamente |
| 20 | Media | Asistentes de IA sin límite de longitud/frecuencia por usuario → abuso de costo de API |
| 21 | Baja | `CRON_SECRET` comparado con `===` en vez de `timingSafeEqual` |
| 22 | Baja | `document-requests.ts`: 2 consultas con `prisma` crudo en vez de `withTenantContext` |
| 23 | Baja (mitigado) | `pdf-lib`: bug de bucle infinito con PNG corrupto, mitigado hoy pero frágil ante código nuevo |

Además, sin CAPTCHA real en login/`/demo` (el freno por IP de hoy baja el
techo del ataque pero no lo elimina si el atacante rota de IP).

---

## 4. MEDIA — Base de datos

- **`db:verify` falla hoy** (local y probablemente producción, si esas
  migraciones llegan a desplegarse): `demo_history_entries` no está en la
  lista `SIN_RLS_A_PROPOSITO` de `scripts/verificar-bd.ts`, igual que le
  pasaba a `rate_limit_hits` antes de hoy. Es el mismo patrón, mismo arreglo
  de una línea — pendiente porque `demo_history_entries` pertenece a la
  feature de demos, sin commitear (ver #1).
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
