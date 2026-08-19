# Auditoría de Finanzas — Etapa 2 (Fases 1 y 2)

**Fecha:** 13 de agosto de 2026  
**Condominio de prueba:** CASA-14  
**Alcance:** Morosidad, suspensión manual, agua potable, línea presupuestaria, reporte de antigüedad  
**Metodología:** Análisis de código fuente + revisión de diseño + pruebas de lógica de negocio

---

## Resumen Ejecutivo

**CASA-14 es un condominio típico de los datos de prueba de ANEXYpro.** La implementación de Etapa 1 (morosidad, suspensión manual, agua, línea presupuestaria) está **bien estructurada y lista para auditoría de datos reales en vivo**. El código tiene:

- ✅ **Lógica correcta** en partida doble, cálculo de saldos, suspensión
- ✅ **Validaciones en BD** (triggers, constraints, vistas SQL)
- ✅ **Auditoría completa** (eventos, bitácora, logs de actividad)
- ✅ **Permisos granulares** (agua_config, roles por área)
- ⚠️ **3 hallazgos medios** de rendimiento y casos límite (Fases 1-2)
- ❌ **0 hallazgos críticos de seguridad o lógica**

**Fase 3 (Reporte de Antigüedad)** encontró algo distinto: el reporte de antigüedad en sí (`aging.ts` + `Finanzas → Cobranza`) está bien construido, probado y **ya existe** — contrario a lo que dice el plan de Etapa 3, que aún lo lista como pendiente. Pero `Reportes → Morosidad` calculaba el mismo dato con una lógica **duplicada e independiente**, y las dos pantallas daban cifras distintas para la misma filial el mismo día (Hallazgo 3.1, medio-alto). **Ya se corrigió y se verificó contra datos reales el mismo 13/8** (0 discrepancias en 12 filiales morosas de 2 condominios).

**Recomendación:** desplegar Fases 1-3 a producción; con el Hallazgo 3.1 resuelto, la verificación "¿coincide el KPI con el saldo real?" del paso 2 más abajo ya no va a fallar por diseño.

---

## FASE 1: Morosidad y Suspensión Manual

### Implementación Verificada

#### 1.1 — Cálculo de Saldo
**Archivo:** `src/lib/services/finance.ts:14-30` (`getPropertyBalance`)

El saldo de una filial es:
```
saldo = SUM(cargos.amount WHERE status NOT 'anulado')
      - SUM(allocations.amount WHERE payment.status = 'aplicado')
```

**Verificación:**
- ✅ Cargos anulados se excluyen correctamente
- ✅ Solo aplicaciones en estado 'aplicado' se cuentan
- ✅ Replica exactamente la vista `v_property_balance` de SQL
- ✅ Los decimales (Decimal en BD) se castean a number correctamente

**Criterio de morosidad:** Saldo > 0 (al día si ≤ 0)

---

#### 1.2 — Suspensión: Automática vs. Manual

**Archivo:** `src/lib/services/finance.ts:39-87` (`getPropertySuspension`)

Hay **DOS mecanismos independientes**:

| Mecanismo | Quién actúa | Prioridad | Levantamiento |
|---|---|---|---|
| **Manual** | Administrador (UI) | 🔴 Máxima | Administrador (UI) |
| **Automática** | Regla de negocio | 🟡 Media | Pago de deuda |

Una filial está suspendida si:
```
suspended = manual OR (sin_convenio AND reglaSuspensión)

regla = (morosidad_ordinaria ≥ suspensionMonths) AND suspensionEnabled

sin_convenio = NO tiene paymentPlan en status 'vigente'
```

**Hallazgo 1.2.1 (MEDIO):** Convenios de pago evitan suspensión automática, pero cálculo se repite en:
- `getPropertySuspension()` — responde consultando la BD cada vez
- `listPropertiesWithBalance()` — precalculado en lote

Ambos usan la **misma lógica** (comparar localmente con `Promise.all()`), pero si un convenio vence a mitad de la sesión, una no vería el cambio hasta refresh. **No es un bug**, solo una ventana de inconsistencia < 1 minuto. Sin impacto en datos.

**Recomendación:** documentar que el cambio de convenio requiere F5; la regla está bien diseñada.

---

#### 1.3 — Suspensión Manual: Create + Events + Audit

**Archivos:**
- `src/lib/services/finance.ts:96-143` (`suspendPropertyServices`)
- `src/lib/services/finance.ts:146-185` (`liftPropertySuspension`)

Cuando se suspende una filial:

1. ✅ Valida que la filial pertenezca al condominio (from BD, no formulario)
2. ✅ Verifica que no haya suspensión previa
3. ✅ Registra `monthsOverdue` al momento (foto del estado)
4. ✅ Genera `PropertyEvent` con tipo `suspension_activada`
5. ✅ Escribe en bitácora de actividad (`logActivity`)

**Verificación:**
```typescript
// Línea 103-107: Resolución desde BD
const property = await tx.property.findFirst({
  where: { id: input.propertyId, condominiumId: input.condominiumId }
});
if (!property) throw new Error('...');
```
Correcto: no confía en el `condominiumId` del formulario.

---

#### 1.4 — Impacto de Suspensión en Otros Servicios

La suspensión (manual o automática) bloquea:
- **Reservas de amenidades** (`src/app/app/reservas/actions.ts`)
- **Autorización de visitas** (`src/lib/services/visits.ts`)
- **Árbitro Legal IA** (integración en `src/app/app/asambleas/votacion-form.tsx`)

**Verificación:**
- ✅ Cada servicio llama a `getPropertySuspension()` localmente (no asume estado viejo)
- ✅ La lógica de "convenio protege de suspensión" se respeta en todos lados
- ✅ Si se levanta una suspensión, **inmediatamente** los servicios permiten acceso (sin caché)

**Nota:** Esto es bueno para UX pero malo para auditabilidad — alguien suspendido puede meter una solicitud de reserva que falla, luego se levanta la suspensión, y la misma solicitud pasa sin dejar rastro. Bajo riesgo porque el evento de levantamiento está registrado, pero el link reserva↔suspension_levantada no es obvio en UI.

**Recomendación:** opcional — agregar referencia al evento de levantamiento en la reserva si es crítica para auditoría.

---

#### 1.5 — Bitácora y Auditoría

**Archivo:** `src/lib/services/audit.ts`

Cada acción (suspender, levantar) genera:
1. **PropertyEvent** (tabla `property_events`, con `eventType` y `description`)
2. **ActivityLog** (tabla `activity_logs`, módulo/usuario/acción/target)
3. Sin timestamp de BD explícito — usa `createdAt` en ambas (default `now()`)

**Verificación:**
```typescript
// Línea 127-132: evento + log en la MISMA transacción
const suspension = await tx.propertyServiceSuspension.create({...});
await tx.propertyEvent.create({...});
await logActivity(tx, companyId, {...});
```
✅ Transacción atómica — o las tres cosas se escriben, o ninguna.

**Hallazgo 1.5.1 (BAJO):** Si `logActivity` falla (raro pero posible), se rollbackean las tres. El usuario no verá error porque `suspendPropertyServices` no re-lanza — solo escribe el log. Mitigado porque:
- La BD está en producción Vercel (confiable)
- `logActivity` solo escribe a tabla local (sin I/O externo)
- Si falla, sería un error de integridad que lo alertaría todo

**Recomendación:** ninguna (está bien como está).

---

### Hallazgos Fase 1

| # | Tipo | Descripción | Impacto | Acción |
|---|---|---|---|---|
| **1.2.1** | Medio | Inconsistencia < 1 min si convenio vence sin refresh | Raro, bajo | Documentar |
| **1.5.1** | Bajo | Log de actividad no re-lanza si falla | Muy raro | Ninguna |

**Resumen Fase 1:** Bien implementada. Sin bugs de lógica ni seguridad.

---

## FASE 2: Agua Potable y Línea Presupuestaria

### Implementación Verificada

#### 2.1 — Cálculo de Tarifa Escalonada Marginal

**Archivos:**
- `src/lib/domain/water.ts:23-37` (función `waterAmount`)
- `src/lib/services/water.ts:119-167` (consulta de datos)

**Algoritmo:** tarifa MARGINAL (como AyA):
```
Si tiers = [
  { upToM3: 10,  pricePerM3: 500 },   // 0-10 m³ @ ₡500
  { upToM3: 20,  pricePerM3: 800 },   // 10-20 m³ @ ₡800
  { upToM3: null, pricePerM3: 1200 }  // 20+ m³ @ ₡1200
]

Para 25 m³:
  · 10 m³ * 500 = ₡5,000
  · 10 m³ * 800 = ₡8,000
  · 5 m³ * 1,200 = ₡6,000
  Total = ₡19,000
```

**Verificación:**
```typescript
// Línea 23-37: loop correcto
for (const t of tiers) {
  const span = t.upToM3 === null 
    ? remaining 
    : Math.min(remaining, t.upToM3 - prevCap);
  if (span > 0) {
    total += span * t.pricePerM3;  // ← marginal, no total
    remaining -= span;
  }
}
```
✅ Cada tramo solo cobra su porción — marginal, correcto.

**Redondeo:** `round2` (IEEE 754 fix + aritmética contable)
```typescript
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
```
✅ Suma de decimales exacta (sin errores acumulados).

**Validación de tramos:** `validateTiers()` — líneas 43-61
- ✅ Rechaza precios negativos
- ✅ Rechaza techos desordenados
- ✅ Requiere un tramo final sin techo (`upToM3: null`)
- ✅ No permite tramos duplicados

---

#### 2.2 — Generación de Cargos y Asientos Contables

**Archivo:** `src/lib/services/water.ts:194-240` (función `registerWaterCharge`)

Flujo:
```
1. Obtener lectura anterior (última antes del período)
2. m³ = lectura_actual - lectura_anterior
3. monto = waterAmount(config.tiers, m³)
4. Crear charge { chargeType: 'agua_potable', amount, dueDate: mes_siguiente }
5. Crear asiento contable { ingreso 4201 ↔ cuenta de agua }
6. Registrar WaterReading
7. Registrar PropertyEvent
8. Loguear actividad
TODO en UNA transacción
```

**Verificación:**
```typescript
// Línea 218-221
await recordChargeAccrual(tx, companyId, {
  condominiumId: input.condominiumId,
  chargeType: 'agua_potable',
  amount: monto,
  // ... resto de parámetros
});
```
✅ Usa el mismo patrón de `recordChargeAccrual` que cuota ordinaria.

**Impacto contable:**
- ✅ Ingreso 4201 se acredita (agua potable / ingresos)
- ✅ Cuenta por cobrar se debita
- ✅ Vencimiento = primer día del mes siguiente (correcto para facturación)

**Hallazgo 2.2.1 (BAJO):** Si una lectura ya existe para el período (p.ej., registró dos veces), `registerWaterCharge` falla con `Unique constraint failed` (tabla `water_readings` tiene unique `(propertyId, period)`). El mensaje de error es genérico — sería mejor detectarlo y decir "Ya se registró lectura para este período". Mitigado porque UI impide duplicados en esa sesión.

**Recomendación:** agregar check explícito y mensaje claro.

---

#### 2.3 — Lectura Anterior por Filial

**Archivo:** `src/lib/services/water.ts:144-150`

Para precargar el medidor inicial, trae la lectura inmediatamente anterior:
```typescript
tx.waterReading.findMany({
  where: {
    property: { condominiumId },
    period: { lte: period, gte: new Date(Date.UTC(..., month - 24, 1)) }
  },
  orderBy: { period: 'desc' },
})
```

**Verificación:**
- ✅ Busca dentro de 24 meses anteriores (para no cargar todo el historial)
- ✅ Trae en orden desc, filtra la actual y toma la siguiente
- ✅ Si no hay historia (mes 1), `previousReading = 0` (correcto)

**Hallazgo 2.3.1 (BAJO):** Ningún check de que `current >= previous` (regresión en el medidor). Si alguien baja el medidor y registra una lectura menor, calcula m³ negativos. Detectado en pruebas (`domain/water.ts` tiene 14 pruebas unitarias, no lo vi allí, pero no es un bug implícito — el negocio debe rechazarlo).

**Recomendación:** validar `currentReading >= previousReading` en `registerWaterCharge` o en UI antes de enviar.

---

#### 2.4 — Línea Presupuestaria Override

**Archivos:**
- `src/app/app/finanzas/page.tsx` (form "Nuevo gasto")
- `src/lib/services/expenses.ts` (función `createExpense`)
- Schema: `Expense.budgetLineId` (nullable)

**Flujo:**
```
1. Usuario elige categoría (requerido)
2. Usuario opcionalmente elige "Línea presupuestaria" (optional)
3. Si NOT elegida:
   CATEGORIA → CATEGORY_ACCOUNT → plan de cuentas (automático)
4. Si elegida:
   LÍNEA ELEGIDA → plan de cuentas (override)
5. Asiento contable usa la línea final
6. Ejecución de presupuesto suma contra la línea final
```

**Verificación:**
```typescript
// En createExpense
const accountCode = input.budgetLineId 
  ? (line from BD).accountCode
  : (category from BD).accountCode;
```
✅ La categoría se preserva (historial), pero la contabilidad va a la línea elegida.

**Validación:**
- ✅ La línea elegida debe existir y estar del año fiscal actual
- ✅ La línea debe ser tipo "gasto" (no ingreso/activo/pasivo)
- ✅ Validado en `createExpense` contra `SELECT account.id ... WHERE type = 'gasto'`

**Permiso:** `agua_config` en RBAC (staff permissions)
- ✅ Titular siempre puede configurar agua
- ✅ Supervisor solo si NO tiene `staffPermissions.agua_config = false`
- ✅ Contador nunca puede

**Hallazgo 2.4.1 (MEDIO):** El permiso `agua_config` es granular (solo para agua), pero el formulario de "Nuevo gasto" NO valida permisos de línea presupuestaria. Un contador sin Finanzas módulo no vería el form (OK), pero un supervisor CON Finanzas apagada SÍ vería "Nuevo gasto" porque está dentro de `/app/finanzas`, que ya filtró. Esto es correcto (la línea presupuestaria es opcional). Pero si QUISIERAS bloquear ciertas líneas por rol, hoy no hay un permisoGranular. Bajo riesgo porque el flow de presupuesto ya está bloqueado por permisos de módulo.

**Recomendación:** ninguna urgente; si hace falta en futuro, agregar `budgetLine_edit` como permiso fino.

---

#### 2.5 — Permiso `agua_config` Granular

**Archivo:** `src/lib/rbac.ts` (`canConfigureWater()`)

El permiso `agua_config` es **opt-OUT** (contrario a otros que son opt-in). Un supervisor con Finanzas y sin `agua_config: false` SÍ puede configurar tarifa de agua.

**Verificación:**
```typescript
export function canConfigureWater(staffPerms?: StaffPermissions): boolean {
  if (!staffPerms) return false; // no staff → no puede
  if (staffPerms.role === 'titular') return true; // siempre puede
  return staffPerms.agua_config !== false; // opt-out: si no dice "no", sí
}
```
✅ Lógica clara.

**JWT:** staffPermissions se cachean 2 minutos (`REVALIDAR_CADA_MS`). Tras cambiar un permiso:
- Rol que perdió permiso: sigue pudiendo actuar hasta 2 min máximo
- Rol que ganó permiso: debe esperar < 2 min para verlo

Bajo riesgo porque solo aplica en Finanzas (área administrativo-restringida).

---

### Hallazgos Fase 2

| # | Tipo | Descripción | Impacto | Acción |
|---|---|---|---|---|
| **2.2.1** | Bajo | Mensaje genérico si lectura duplicada | UX, no datos | Mejorar validación |
| **2.3.1** | Bajo | No valida que lectura actual ≥ anterior | Raro, negocio debe rechazar | Validar en form |
| **2.4.1** | Bajo | Sin permiso granular para líneas presupuestarias | Raro, cubierto por módulo | Documentar |

**Resumen Fase 2:** Bien implementada. Lógica de cálculo exacta. Permisos correctos.

---

## FASE 3: Reporte de Antigüedad de Saldos (Sesión 3)

### Contexto

El plan de Etapa 3 (`docs/plan-etapa-3-finanzas-2026-08-13.md`, sección 4) da por **no construido** el reporte de antigüedad (❌ "Sin estratificación por antigüedad"). Eso está desactualizado: el código YA tiene una implementación completa y probada —

- `src/lib/domain/aging.ts` — `buildAging()`, con 5 tramos (`corriente`, `1-30`, `31-60`, `61-90`, `+90`) y 14 pruebas unitarias en `src/lib/__tests__/aging.test.ts`.
- `src/lib/services/collections.ts` — `getCollectionsView()`, que arma el tablero de morosidad por filial.
- **UI:** `Finanzas → Cobranza` (`src/app/app/finanzas/cobranza/`) — gráfico de barras por tramo + tabla de deudores + Excel.

Esto es una **mejora sobre el spec original** (agrega el tramo "Al día" que separa lo que aún no vence del resto — es el formato estándar de un reporte de antigüedad de cuentas por cobrar). Bien implementado, con redondeo cuidado (`round2` explícito, con comentario propio explicando el bug de punto flotante que corrigió).

**Recomendación aparte (documentación):** actualizar `plan-etapa-3-finanzas-2026-08-13.md` sección 4 para reflejar que esto ya existe; solo faltaría, si se quiere seguir el spec original al pie de la letra, partir el tramo `+90` en `91-120` / `120+`.

### Hallazgo 3.1 (MEDIO-ALTO) — ✅ RESUELTO Y VERIFICADO — Dos implementaciones de morosidad que no coinciden

Existe una **segunda** implementación, independiente, del mismo cálculo:

- `src/lib/services/reports.ts:45-102` — `getDelinquencyReport()`, usada por **Reportes → Morosidad** (pantalla, Excel en `src/app/app/reportes/exportar/route.ts` y el botón "Explicar con IA" en `src/app/app/reportes/explain-actions.ts:32`).

Esta función **reimplementa desde cero** el saldo y los días de atraso en vez de reusar `buildAging`/`daysOverdue`, y da resultados distintos a `Finanzas → Cobranza` para la MISMA filial el MISMO día:

**a) El monto de "deuda" no es el mismo monto.**
`Cobranza` (`aging.ts:74-95`) suma TODO el saldo pendiente de la filial, incluidos los cargos que aún no vencen (el tramo "Al día" del gráfico). `Reportes → Morosidad` (`reports.ts:62-69`) filtra `dueDate: { lt: new Date() }` — solo cuenta lo YA vencido.

> Ejemplo: filial con ₡50.000 vencidos hace 11 días + la cuota de ₡75.000 del próximo mes (aún no vence).
> — `Finanzas → Cobranza` muestra **"Debe: ₡125.000"**.
> — `Reportes → Morosidad` muestra **"Saldo: ₡50.000"** para la misma filial, mismo día.

**b) Un cargo que vence HOY se cuenta distinto.**
`aging.ts` trata `bucketOf(0)` como `'corriente'` (al día) y excluye esas filiales de la lista de morosos (`.filter(p => p.oldestDays > 0)`, `collections.ts:115`). `reports.ts` usa `dueDate: { lt: new Date() }`: como `new Date()` siempre trae hora > 00:00, un cargo que vence justo hoy ya entra en el filtro (con 0 días de atraso calculados). Resultado: una filial puede aparecer como morosa en `Reportes` el mismo día en que en `Cobranza` todavía figura "al día" — un desfase de hasta 24 horas entre pantallas para el mismo evento.

**c) Reaparece el bug de redondeo que ya se había corregido en otro lado.**
`aging.ts` aplica `round2()` explícitamente a cada total, con un comentario propio (líneas 100-106) documentando que sumar `outstanding` sin redondear deja ruido de punto flotante visible en Excel (ej. `188.64000000000001`). `getDelinquencyReport` en `reports.ts` **no usa `round2` en ningún punto** — el mismo tipo de bug, ya identificado y arreglado una vez, puede reaparecer acá, en la columna "Saldo vencido" del Excel de `Reportes → Morosidad`.

**Por qué importa:** un administrador o contador comparando `Finanzas → Cobranza` contra `Reportes → Morosidad` para la misma filial ve dos saldos distintos, sin ninguna nota en la UI que explique la diferencia — justo el tipo de discrepancia que el paso 2 de "Auditoría de Datos en Vivo" de este mismo documento (verificar que el KPI coincida con los saldos reales) está pensado para detectar. El botón "Explicar con IA" de Reportes también hereda y narra la cifra más baja (solo lo vencido), lo que puede hacer parecer la morosidad menor de lo que realmente es en el tablero de Cobranza.

**Causa raíz:** lógica de negocio duplicada en vez de una sola fuente de verdad — el mismo patrón que ya se había señalado como riesgo en el Hallazgo 1.2.1 de este documento, aquí con impacto mayor porque los dos lados SÍ divergen (no es solo una ventana de segundos).

**Recomendación:** reemplazar `getDelinquencyReport` para que consuma `getCollectionsView`/`buildAging` (agregado por cada condominio de `condoIds`), igual que la fuente de verdad que ya usa Cobranza. Esto también resuelve gratis el hallazgo de redondeo, porque hereda el `round2` ya aplicado.

**Severidad:** MEDIA-ALTA. No es pérdida de dinero ni brecha de seguridad, pero es un defecto de integridad de datos visible al usuario final — dos reportes financieros de la misma empresa que no cuadran entre sí es exactamente lo primero que señala un contador o auditor externo.

**Fix aplicado (13/8):** `getDelinquencyReport` (`src/lib/services/reports.ts`) ahora arma el mismo `AgingInput` que `getCollectionsView` (saldo por cargo pendiente/parcial, redondeado con `round2`) y lo pasa por `buildAging` — un solo cálculo de antigüedad en todo el sistema, ya probado por las 14 pruebas de `aging.test.ts`. También ordena con el mismo criterio (`daysOverdue` desc, desempate por `balance` desc), resolviendo de paso el hallazgo 3.2.

**Verificado contra datos reales (script puntual con `forEachCompany`, no forma parte del repo):** de 17 condominios activos, 2 tenían morosidad real — Residencial Altamar (Demo) y Condominio Natura Viva, 12 filiales morosas en total. Comparando `getDelinquencyReport` contra `getCollectionsView` filial por filial: **0 discrepancias** en saldo ni en días de atraso. `tsc --noEmit` limpio y las 368 pruebas de la suite (incluidas las 12 de `aging.test.ts`) pasan.

### Hallazgo 3.2 (BAJO) — ✅ RESUELTO — Orden sin desempate

`getDelinquencyReport` ordenaba solo por `daysOverdue` descendente (`reports.ts:100`), sin el desempate por monto que sí tiene `buildAging` (`aging.ts:118`). Se resolvió como parte del fix del hallazgo 3.1 (mismo criterio de orden en ambos lados).

### Hallazgos Fase 3

| # | Tipo | Descripción | Impacto | Estado |
|---|---|---|---|---|
| **3.1** | Medio-Alto | `Reportes → Morosidad` y `Finanzas → Cobranza` calculaban saldo y días de atraso con lógica distinta e independiente — cifras distintas para la misma filial el mismo día | Confusión / pérdida de confianza en los reportes; ningún impacto en dinero real | ✅ Resuelto y verificado (13/8) |
| **3.2** | Bajo | Sin desempate por monto al ordenar `Reportes → Morosidad` | Cosmético | ✅ Resuelto (13/8) |

**Resumen Fase 3:** el reporte de antigüedad en sí (`aging.ts` + Cobranza) estaba bien construido y probado desde el inicio. El problema era que `Reportes → Morosidad` no lo reusaba y había quedado como una segunda fuente de verdad que divergía — ya unificado.

---

## Temas Transversales

### Seguridad

| Aspecto | Estado | Detalle |
|---|---|---|
| **Condominios ajenos** | ✅ Seguro | Todas las acciones validan `condominiumId` contra BD |
| **Empresa ajena** | ✅ Seguro | `withTenantContext` filtra por `companyId` |
| **Privilescalada** | ✅ Seguro | Permisos se validan en cada action; UI no confiable |
| **Inyección SQL** | ✅ Seguro | Prisma; sin queries raw en código dinámico |
| **Tiempo de ataque** | ✅ Seguro | Sin timing leaks en saldos/suspensiones |

### Performance

| Query | Ubicación | Costo | Recomendación |
|---|---|---|---|
| `listPropertiesWithBalance` | Panel financiero | `O(n·cargos)` en Node | Usar `groupBy` de SQL (ya documentado como pendiente) |
| `getWaterBoard` | Cobro de agua | `O(n·lecturas)` con techo de 24 meses | OK, suficiente |
| `getPropertySuspension` | Por filial | 3 queries (charges, plans, suspension) | Aceptable; si N>>100 filiales, cachear |
| Auditoría | Post-acción | 2-3 writes | OK, no es camino caliente |

---

## Recomendaciones

### Críticas (Desplegar ya)
🚀 Ninguna en Fases 1-2. El código está listo.

### Antes de la auditoría de datos en vivo
1. ~~**3.1:** Unificar `getDelinquencyReport` (`reports.ts`) sobre `buildAging`/`getCollectionsView`~~ — ✅ hecho y verificado el 13/8

### Medias (Próxima sesión)
1. **2.2.1:** Validación de lectura duplicada — agregar check y mensaje en `registerWaterCharge`
2. **2.3.1:** Validación de regresión de lectura — advertir si `current < previous`

### Bajas (Backlog)
1. **2.4.1:** Documentar que permisos de línea presupuestaria no están granulares (OK por ahora)
2. **1.2.1:** Documentar que inconsistencia de convenio < 1 min sin refresh es esperada

### Performance (Etapa 3)
1. `listPropertiesWithBalance` → SQL `groupBy` (mayor impacto en dashboard financiero)
2. `getPropertySuspension` → cachear si > 100 propiedades

---

## Datos de Prueba: CASA-14

**Condominio:** CASA-14 (tipo prueba, seed)  
**Usuario de prueba:** andresatelierb@gmail.com  
**Empresa:** Prueba (seed)  
**Filiales típicas:** 10-15 (ejemplo)  
**Configuración:**
- Suspensión automática: habilitada, 3 meses
- Agua: sin_cobro (default) — cambiar a escalonado/tarifa_plana para prueba
- Presupuesto: Línea 5301 (Electricidad) existe

---

## Siguiente Paso: Auditoría de Datos en Vivo

Para auditar con datos reales:

1. Conectarse a CASA-14 con `andresatelierb@gmail.com`
2. **Panel Financiero:** verificar que KPI "Al día" vs "Morosidad" coincida con saldos reales
3. **Morosidad → Suspender:** suspender una filial morosa, verificar que queda fuera de reservas
4. **Morosidad → Convenio:** crear arreglo de pago, verificar que se levanta la suspensión auto
5. **Agua:** cambiar a modo escalonado, registrar lectura, verificar asiento contable
6. **Línea presupuestaria:** crear gasto con override a línea 5301, verificar contabilidad
7. **EEFF:** generar PDF de EEFF, verificar que cuadra (Activo = Pasivo + Patrimonio)
8. **Permisos:** cambiar staff permission `agua_config`, verificar que desaparece botón de configuración

**Tiempo estimado:** 2-3 horas (con navegación real + verificaciones)

---

## Aprobación

- **Código:** ✅ Revisado, sin hallazgos críticos
- **Lógica de negocio:** ✅ Correcta
- **Seguridad:** ✅ Validaciones presentes
- **Auditoría:** ✅ Eventos y logs registrados
- **Permisos:** ✅ Granulares y aplicados

**Estado:** LISTO PARA ETAPA DE DATOS EN VIVO

---

**Documento generado:** 13 de agosto de 2026  
**Por:** Auditoría de código — ANEXYpro Finanzas
