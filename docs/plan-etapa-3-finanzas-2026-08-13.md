# ETAPA 3 — Cuotas, Ingresos, Pagos y Morosidad
## Plan de Ejecución Detallado

**Fecha:** 13 de agosto de 2026  
**Estado:** Pre-ejecución (Plan)  
**Alcance:** Cubrir spec de cuotas/pagos/morosidad + 9 pruebas de caso de negocio  

---

## Executive Summary

**Qué existe hoy:**
- ✅ Modelo completo de cuotas (chargeType: ordinaria, extraordinaria, agua, interés, ajuste)
- ✅ Modelo de pagos (Payment, PaymentAllocation con algoritmo oldest-first)
- ✅ Cálculo de morosidad (misma fuente de verdad que estado de cuenta)
- ✅ Pantalla de morosidad con KPI clicable
- ✅ Tests de asignación de pagos (6 casos)
- ✅ Validación de condominio en acciones

**Qué falta:**
- ❌ UI para crear cuotas extraordinarias
- ❌ UI para registrar pagos (manual, métodos variados)
- ❌ UI para anular/cancelar cuotas
- ❌ Reporte de antigüedad de saldos (30/60/90/+120)
- ❌ Validación de duplicados en pagos
- ❌ Tests de aislamiento entre condominios
- ❌ Tests de 9 casos de negocio del spec

**Impacto de no tenerlo:** Hoy los administradores NO pueden registrar pagos por UI; solo los genera el sistema (agua). No hay forma de anular cuotas. Los reportes de morosidad no muestran antigüedad.

---

## 1. UI para Cuotas Extraordinarias

### Estado Actual
- ✅ Chargeype `cuota_extraordinaria` existe en schema
- ❌ No hay pantalla de creación
- ❌ No hay validación de condominio
- ❌ No hay tests

### Implementación (2-3 horas)

**Archivo:** `src/app/app/finanzas/cargos/page.tsx` (crear)

```tsx
// UI: Seleccionar filial → monto → descripción → fecha de vencimiento
// Action: validateAndCreateCharge()
// - Validar condominio (desde BD)
// - Validar filial (pertenece al condominio)
// - Generar asiento contable (cargo)
// - Registrar evento
// - Loguear actividad
```

**Validaciones obligatorias:**
- Filial existe y pertenece al condominio
- Monto > 0
- Fecha de vencimiento en futuro
- Usuario tiene permiso Finanzas

**Asiento contable:**
- Débito: Cuentas por cobrar (extraordinaria) — cuenta específica
- Crédito: Ingreso (extraordinario)

**Tests:**
- Crear cuota extraordinaria nueva
- Validar condominio
- Validar monto > 0
- Validar fecha
- Verificar asiento en libro mayor

---

## 2. UI para Registro de Pagos

### Estado Actual
- ✅ Modelo de Payment + PaymentAllocation
- ✅ `makePaymentAction` en actions.ts
- ⚠️ Sin UI accesible
- ⚠️ No hay constraint para evitar duplicados

### Implementación (3-4 horas)

**Archivo:** `src/app/app/finanzas/pagos/page.tsx` (crear)

```tsx
// UI: Seleccionar filial → monto → método → referencia → fecha
// Mostrar preview de saldo después del pago
// Confirmar asignación de pago (oldest-first)
```

**Métodos de pago:**
- Efectivo
- Transferencia bancaria
- Cheque
- Tarjeta de crédito
- Depósito
- Otros

**Validaciones obligatorias:**
- Filial existe y pertenece al condominio
- Monto > 0
- Referencia única por método (opcional: constraint en BD)
- Usuario tiene permiso Finanzas

**Flujo de asignación:**
- Buscar cargos pendientes de la filial (status: 'pendiente' | 'parcial')
- Ordenar por dueDate ASC (oldest first)
- Asignar pago → crear PaymentAllocation
- Actualizar status del charge si es necesario
- Generar asiento contable (cobro)
- Registrar evento
- Loguear actividad

**Dupliación:**
- Agregar constraint único: `UNIQUE(propertyId, paymentMethod, reference, appliedAt)` (en migración)
- O detectar en aplicación: `findFirst({ propertyId, method, ref, appliedAt })` antes de `create`

**Tests:**
- Pago completo (una cuota)
- Pago parcial (múltiples cuotas)
- Pago con excedente (adelanto)
- Pago con método y referencia
- Evitar duplicado (mismo método, ref, fecha)
- Validar aislamiento de condominio

---

## 3. UI para Anular/Cancelar Cuotas

### Estado Actual
- ✅ Status 'cancelado' existe en schema
- ❌ No hay acción para cambiar status
- ❌ No hay reversión de asientos

### Implementación (2 horas)

**Archivo:** `src/app/app/finanzas/cargos/[id]/cancel-action.ts` (crear)

```typescript
export async function cancelChargeAction(
  companyId: string,
  input: {
    chargeId: string;
    condominiumId: string;
    reason: string; // obligatorio para auditoría
  }
) {
  // 1. Validar charge existe y pertenece al condominio
  // 2. Si ya tiene pagos aplicados, rechazar (no se puede anular parcialmente cobrado)
  // 3. Cambiar status a 'cancelado'
  // 4. Generar asiento de reversión (débito/crédito invertidos)
  // 5. Registrar evento 'cargo_cancelado'
  // 6. Loguear actividad con razón
}
```

**Restricciones:**
- Solo se puede anular cargo sin pagos aplicados
- Si ya está aplicado, ofrecer devolución/crédito en su lugar
- Requiere explicación en la auditoría

**Asiento de reversión:**
- Invertir débito/crédito del original
- Generar nuevo asiento con mismo período pero negativo

**Tests:**
- Anular cargo pendiente
- Rechazar anulación de cargo con pagos
- Verificar reversión en libro mayor

---

## 4. Reporte de Antigüedad de Saldos

### Estado Actual
- ✅ Vista `v_condo_finance_kpis` muestra al día/morosidad
- ❌ Sin estratificación por antigüedad

### Implementación (2-3 horas)

**Archivo:** `src/lib/services/aging.ts` (ampliar)

```typescript
export type AgingBucket = {
  bucket: '0-30' | '31-60' | '61-90' | '91-120' | '120+';
  properties: number;
  amount: number;
  percentage: number;
};

export async function getAgingReport(
  companyId: string,
  condominiumId: string
): Promise<AgingBucket[]> {
  // 1. Traer cargos ordinarios pendientes
  // 2. Para cada uno, calcular días de atraso (hoy - dueDate)
  // 3. Agrupar por bucket
  // 4. Sumar montos y contar propiedades
  // 5. Calcular % del total
}
```

**UI:** `src/app/app/finanzas/cobranza/aging-panel.tsx` (crear)

- Tabla con buckets: 0-30, 31-60, 61-90, 91-120, 120+
- Mostrar # de propiedades y monto por bucket
- Porcentaje del total moroso
- Link a cada bucket → lista de propiedades

**Tests:**
- Cargo vence hoy → bucket 0-30
- Cargo vence hace 45 días → bucket 31-60
- Cargo vence hace 100 días → bucket 91-120
- Verificar totales

---

## 5. Validación de Duplicados en Pagos

### Implementación (1 hora)

**Opción A: Constraint en BD (recomendado)**

```sql
ALTER TABLE payments ADD CONSTRAINT unique_payment_ref
  UNIQUE (propertyId, paymentMethod, reference, DATE(appliedAt))
  WHERE status = 'aplicado';
```

**Opción B: Verificación en aplicación**

```typescript
// En makePaymentAction
const existing = await tx.payment.findFirst({
  where: {
    propertyId: input.propertyId,
    paymentMethod: input.method,
    reference: input.reference,
    appliedAt: { equals: input.appliedAt }
  }
});
if (existing) throw new Error('Este pago ya fue registrado.');
```

**Mitigación:** Ambas combinadas.

**Tests:**
- Mismo método, referencia, fecha → rechazado
- Mismo método, ref distinta → aceptado
- Método distinto, misma referencia → aceptado

---

## 6. Tests de 9 Casos de Negocio

### Spec de Pruebas (7-8 horas)

Crear archivo: `src/lib/__tests__/finance-cases.test.ts`

**Caso 1: Condominio Nuevo**
```typescript
it('condominio nuevo sin cuotas', () => {
  // Crear condominio, 0 cargos, 0 pagos
  // Verificar balance = 0, suspensión = no
})
```

**Caso 2: Propietario al Día**
```typescript
it('propietario con cuota ordinaria pagada completamente', () => {
  // Crear cuota 100.000, pago 100.000
  // Verificar balance = 0, status = pagado
})
```

**Caso 3: Un Período Pendiente**
```typescript
it('propietario con un periodo pendiente', () => {
  // Crear cuota sin pago
  // Verificar balance = monto, status = pendiente, suspensión = no (aún)
})
```

**Caso 4: Dos Períodos Pendientes**
```typescript
it('propietario con dos periodos pendientes', () => {
  // Crear 2 cuotas ordinarias sin pago
  // Verificar balance = suma, suspensión = sí (si config suspensionMonths=1)
})
```

**Caso 5: Pago Parcial**
```typescript
it('pago parcial asigna al cargo más antiguo', () => {
  // Crear 2 cuotas: 50k + 50k, pagar 60k
  // Verificar: 50k al cargo 1 (oldest), 10k al cargo 2
  // Status de cargo 1 = pagado, cargo 2 = parcial
})
```

**Caso 6: Pago Completo**
```typescript
it('pago completo marca cargo como pagado', () => {
  // Crear cuota 100k, pagar 100k
  // Verificar status = pagado, balance = 0
})
```

**Caso 7: Pago Atrasado**
```typescript
it('pago de cargo vencido registra en bitácora', () => {
  // Crear cuota con dueDate hace 45 días
  // Pagar, verificar evento 'pago_atrasado' o similar
})
```

**Caso 8: Anulación**
```typescript
it('anular cuota sin pagos invierte asiento', () => {
  // Crear cuota 100k, anular
  // Verificar status = cancelado, asiento reversado
  // Verificar balance = 0
})
```

**Caso 9: Dos Condominios Simultáneamente**
```typescript
it('no mezcla información entre condominios', () => {
  // Crear condo A: cuota 100k
  // Crear condo B: cuota 200k
  // Pagar 100k a A
  // Verificar: balance A = 0, balance B = 200k (sin mezcla)
})
```

**Matriz de verificación:**

| Caso | Cuota | Pago | Status | Balance | Suspensión | Asiento | Evento |
|---|---|---|---|---|---|---|---|
| 1 | ✅ Crear | ✅ Registrar | ✅ Correcto | ✅ Exacto | ✅ No | ✅ Generado | ✅ Registrado |
| 2-9 | (ídem) | (ídem) | (ídem) | (ídem) | (ídem) | (ídem) | (ídem) |

---

## 7. Datos de Prueba: CASA-14

**Condominio:** CASA-14 (seed)  
**Filiales:** 10-15 (típicas)  
**Escenarios:**
- Filial al día (con pago completo registrado)
- Filial con 1 período pendiente
- Filial con 2+ períodos pendientes
- Filial con pago parcial
- Filial con cuota extraordinaria
- Filial con pago atrasado

**Script de seed:** `prisma/seed.ts` (ampliar con escenarios ETAPA 3)

---

## 8. Cronograma Estimado

| Tarea | Horas | Días |
|---|---|---|
| 1. UI Cuotas Extraordinarias | 2-3 | 1 |
| 2. UI Registro de Pagos | 3-4 | 1 |
| 3. UI Anular Cuotas | 2 | 0.5 |
| 4. Reporte Antigüedad | 2-3 | 1 |
| 5. Validación Duplicados | 1 | 0.25 |
| 6. Tests 9 Casos | 7-8 | 2 |
| **TOTAL** | **17-23 horas** | **5-6 días** |

(Estimado para 1 dev trabajando solo; parallelizable en pares)

---

## 9. Orden de Implementación Recomendado

### Sesión 1 (Hoy/Mañana) — 6-7 horas
1. ✅ UI Registro de Pagos (núcleo crítico)
2. ✅ Validación de duplicados (1h)
3. ✅ Tests básicos de pagos (2h)

### Sesión 2 — 6-7 horas
1. ✅ UI Cuotas Extraordinarias
2. ✅ Tests de cuotas

### Sesión 3 — 5-6 horas
1. ✅ UI Anular Cuotas
2. ✅ Reporte de Antigüedad
3. ✅ Tests de 9 casos completos

---

## 10. Criterios de Aceptación

**Código:**
- ✅ `tsc --noEmit` limpio
- ✅ 318+ tests pasan
- ✅ `db:verify` 11/11
- ✅ `next build` de producción sin errores

**Datos:**
- ✅ CASA-14 con 9 escenarios de prueba
- ✅ Sin mezcla de información entre condominios
- ✅ Saldos coinciden entre UI y estado de cuenta

**Auditoría:**
- ✅ Eventos registrados para todas las acciones
- ✅ Asientos contables generados correctamente
- ✅ Permisos validados en cada action

---

## 11. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Duplicado de pagos | Alto | Constraint en BD + validación en app |
| Mezcla de condominios | Crítico | Validar en TODAS las acciones |
| Asientos desbalanceados | Alto | Usar `recordChargeAccrual` + tests |
| Performance en reportes | Medio | Índices en charges(status, propertyId, dueDate) |

---

## 12. Documentación Pendiente

- [ ] README de Pagos (flujo, métodos, validaciones)
- [ ] README de Cuotas Extraordinarias
- [ ] Runbook de anulación de cuotas
- [ ] Guía de antigüedad de saldos para administrador
- [ ] Actualizar spec de Finanzas (marca ETAPA 3 como completa)

---

## Siguiente Paso

¿Empezamos con **Sesión 1** (UI de Pagos + Validación de Duplicados)?

Tiempo estimado: **6-7 horas**  
Impacto: Desbloqueará registrar pagos manuales por UI (funcionalidad crítica)
