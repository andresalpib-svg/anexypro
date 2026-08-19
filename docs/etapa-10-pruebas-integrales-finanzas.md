# Etapa 10 — Pruebas integrales del módulo de Finanzas

Fecha: 2026-08-20

# VEREDICTO: **APROBADO CON OBSERVACIONES**

> **Actualización 2026-08-19 — OBS-1 y OBS-2 CORREGIDAS y desplegadas.**
> También se corrigieron dos observaciones que venían de la Etapa 7 (signo
> del balance en pantalla, rótulos del panel financiero) y una de la Etapa 8
> (IP y navegador en el rastro de cambios). Ver el detalle al final.

Los nueve criterios de aprobación se cumplen. Las 36 cifras que calculé a mano
coinciden **exactamente** con lo que reporta el sistema, los tres condominios
están completamente aislados y la facturación electrónica sigue apagada.

La observación que impide un "APROBADO" a secas no es un error de cálculo ni una
fuga de datos: es que `Reportes → Descargar Excel` **entrega en silencio el
reporte de otro condominio** cuando se pide uno al que no se tiene acceso. Nadie
ve datos ajenos, pero sí puede leer como propios unos números que no lo son. El
detalle está abajo, con su solución propuesta.

---

## Cómo se probó

```bash
npx tsx --env-file=.env scripts/probar-etapa10.ts            # 57 comprobaciones
npx tsx --env-file=.env scripts/probar-etapa10.ts --limpiar  # borra los 3 condominios
```

Los tres condominios se crean con `createCondominium`, **el mismo servicio que usa
la pantalla** — así se prueba de verdad que un condominio nuevo nace en cero, con
su propio plan de cuentas, y no una réplica de laboratorio.

| Prueba | Comprobaciones | Resultado |
| --- | --- | --- |
| Integral de la Etapa 10 | 57 | ✅ 0 fallos |
| Contraste manual de 36 cifras | 36 | ✅ 0 discrepancias |
| Acceso por HTTP (3 roles, 3 condominios) | 13 | ✅ 0 fallos |
| Regresión Etapa 7 (reportes) | 83 | ✅ |
| Regresión Etapa 8 (ataques + trazabilidad) | 32 + 16 | ✅ |
| Regresión Etapa 9 (FE apagada) | 22 | ✅ |
| Suite unitaria | 425 | ✅ |
| Verificador de base | 11 | ✅ |

### El escenario

| | Condominio A | Condominio B | Condominio C |
| --- | --- | --- | --- |
| Cuotas | ₡120 000 + ₡80 000 | ₡55 000 + ₡210 000 | — |
| Pago | ₡45 000 (parcial) | ₡210 000 (una cuota completa) | — |
| Gastos | ₡300 000 + ₡45 000 | ₡91 000 + ₡12 500 | — |
| Presupuesto | ₡400 000 + ₡60 000 | ₡70 000 + ₡90 000 (se excede) | — |
| Fondo | Reserva, cuenta 1200 | Especial, cuenta 1210 | — |
| Aporte / compromiso | ₡3 000 000 / ₡250 000 | ₡800 000 / ₡60 000 | — |
| Inversión / interés | ₡1 500 000 / ₡37 500 | ₡400 000 / ₡9 100 | — |
| Activo | ₡2 400 000 · 48 meses · 3 depreciados | ₡900 000 · 36 meses · 1 depreciado | — |

B no es "A con otros números": tiene otro tipo de fondo, otra cuenta contable,
otro comportamiento de pago (completo vs. parcial) y un presupuesto que se excede.
Si el sistema mezclara algo, no bastaría con que las cifras cuadraran.

## Contraste manual — las 36 cifras

Calculadas a mano antes de mirar el sistema:

| Concepto | A (a mano) | A (sistema) | B (a mano) | B (sistema) | C |
| --- | --- | --- | --- | --- | --- |
| Facturado | 200 000 | ✅ 200 000 | 265 000 | ✅ 265 000 | ✅ 0 |
| Recaudado | 45 000 | ✅ 45 000 | 210 000 | ✅ 210 000 | ✅ 0 |
| Morosidad | 155 000 | ✅ 155 000 | 55 000 | ✅ 55 000 | ✅ 0 |
| Ingresos | 237 500 | ✅ 237 500 | 274 100 | ✅ 274 100 | ✅ 0 |
| Egresos del módulo | 345 000 | ✅ 345 000 | 103 500 | ✅ 103 500 | ✅ 0 |
| Depreciación | 150 000 | ✅ 150 000 | 25 000 | ✅ 25 000 | ✅ 0 |
| **Egresos totales** | 495 000 | ✅ 495 000 | 128 500 | ✅ 128 500 | ✅ 0 |
| **Resultado** | −257 500 | ✅ −257 500 | 145 600 | ✅ 145 600 | ✅ 0 |
| Presupuestado | 460 000 | ✅ 460 000 | 160 000 | ✅ 160 000 | ✅ 0 |
| Total del fondo | 3 037 500 | ✅ 3 037 500 | 809 100 | ✅ 809 100 | ✅ 0 |
| Fondo operativo | 1 287 500 | ✅ 1 287 500 | 349 100 | ✅ 349 100 | ✅ 0 |
| Valor en libros | 2 250 000 | ✅ 2 250 000 | 875 000 | ✅ 875 000 | ✅ 0 |

**0 discrepancias.** Verificado también en pantalla: `Reportes → Resumen` muestra
₡237 500 / ₡495 000 / −₡257 500 para A, ₡274 100 / ₡128 500 / ₡145 600 para B, y
ceros con "Sin movimientos contables todavía" para C.

## Las 12 validaciones pedidas

| # | Validación | Resultado |
| --- | --- | --- |
| 1 | A no contiene información de B | ✅ |
| 2 | B no contiene información de A | ✅ |
| 3 | C permanece en cero | ✅ en las 7 dimensiones |
| 4 | Saldos independientes | ✅ |
| 5 | Morosidad independiente | ✅ A ₡155 000 (2 filiales), B ₡55 000 (1), C ninguna |
| 6 | Fondos independientes | ✅ distinto tipo, distinta cuenta, distinto saldo |
| 7 | Inversiones independientes | ✅ montos e intereses propios |
| 8 | Activos independientes | ✅ |
| 9 | Depreciaciones independientes | ✅ |
| 10 | Presupuestos independientes | ✅ |
| 11 | Reportes independientes | ✅ consolidado, acotado y morosidad |
| 12 | Permisos | ✅ ver abajo |

**Permisos (12), probados por HTTP y no solo en servicio:** un supervisor asignado
solo a A recibe 403 al pedir los saldos de B y de C; un condómino recibe 403 al
pedir los de A; el condómino es redirigido al pedir los estados financieros; el
consolidado del supervisor no incluye B ni C.

## Pruebas matemáticas

| Identidad | A | B | C |
| --- | --- | --- | --- |
| Ingresos − Egresos = Resultado | ✅ | ✅ | ✅ |
| Adquisición − Depreciación acumulada = Valor en libros | ✅ | ✅ | n/a |
| Presupuesto − Ejecutado = Variación (**todas** las partidas) | ✅ | ✅ | ✅ |
| Operativo + Comprometido + Invertido = Total del fondo | ✅ | ✅ | n/a |
| **Presupuesto ejecutado = total de Reportes → Egresos** | ✅ | ✅ | ✅ |

La última es la que confirma la fuente de verdad única que introdujo la Etapa 7:
el mismo número de egresos en Presupuesto, en Egresos y en Resumen.

## Facturación electrónica

| Verificación | Resultado |
| --- | --- |
| Independiente por condominio | ✅ configuración 1 a 1, sin herencia |
| No está activa | ✅ los tres nacen `inactivo` / `pruebas` / `ninguno` |
| No emite comprobantes | ✅ 0 documentos |
| No se conecta con Hacienda | ✅ `IMPLEMENTADOS` vacío; emitir se niega en los tres |
| No comparte credenciales | ✅ 0 credenciales guardadas |
| No comparte consecutivos | ✅ A entrega 1 y 2; B arranca en 1; C no tiene ninguno |
| No comparte información fiscal | ✅ identificación, actividad y condición tributaria en `null` en los tres |

---

# Observaciones

## OBS-1 · El Excel de Reportes entrega en silencio el condominio equivocado

- **Problema.** Un supervisor asignado solo al condominio A pide
  `/app/reportes/exportar?tab=egresos&condoId=<B>` y recibe **200 con el Excel de
  A** (₡495 000, las filiales de A), sin ningún aviso de que no se le dio lo que
  pidió. Lo mismo con un `condoId` de otra empresa administradora.
- **Causa.** `resolveCondoId` está diseñado para resolver el Condominio Activo y,
  ante un id no permitido, cae al primero disponible. En una pantalla eso es
  razonable; en una ruta de descarga, no. Las rutas hermanas
  (`finanzas/exportar`, `finanzas/exportar-estado`, `contabilidad/eeff`) sí
  validan el id contra `listCondominiumsForSession` y responden **403**.
  `reportes/exportar` no hace esa comprobación.
- **Impacto.** No hay fuga: nunca se ven datos de B. El riesgo es de otro tipo —
  el archivo descargado no dice a qué condominio pertenece, así que alguien puede
  presentar a una junta directiva las cifras de otro condominio creyendo que son
  las suyas. También afecta al administrador, que ve todos los condominios: un
  `condoId` mal copiado devuelve otro reporte sin avisar.
- **Prioridad.** **Media.** No compromete datos ni cálculos, pero puede producir
  una decisión financiera sobre el condominio equivocado.
- **Solución propuesta.** Dos cambios pequeños en
  `src/app/app/reportes/exportar/route.ts`: (1) validar `condoId` contra
  `listCondominiumsForSession` y responder 403 cuando no esté, igual que las
  otras tres rutas de descarga; (2) agregar el nombre del condominio y el año
  como primera fila u hoja de cada Excel, para que el archivo se identifique solo.
  Conviene aplicar (2) también a las descargas de Finanzas.
- **Prueba realizada.** Inicié sesión por HTTP como `supervisor-a@etapa8.test`
  (asignado solo a A) y descargué el Excel de egresos de B. Devolvió 200 con las
  cuatro filas de A —"Vigilancia ₡300 000", "Zacate ₡45 000", depreciación
  ₡150 000, TOTAL ₡495 000— y ninguna de B.

## OBS-2 · Presentación menor: reporte vacío sin leyenda

- **Problema.** El Excel de Egresos de un condominio sin movimientos trae una sola
  fila `TOTAL · Egresos contabilizados 2026 · 0`, mientras las demás pestañas usan
  la leyenda "Sin datos para este reporte todavía".
- **Causa.** La pestaña de Egresos, rehecha en la Etapa 7, siempre agrega su fila
  de total.
- **Impacto.** Ninguno sobre los datos. Es una inconsistencia de presentación
  entre pestañas. Discutible incluso si es un defecto: decir "cero" explícitamente
  es más informativo que "sin datos".
- **Prioridad.** **Baja.**
- **Solución propuesta.** Unificar el criterio en las 14 pestañas: preferir el
  total explícito en cero, que es más claro para un reporte financiero.
- **Prueba realizada.** Descargué el Excel de egresos del condominio C.

## Observaciones abiertas de etapas anteriores

Siguen pendientes, ya documentadas; ninguna se reabrió en estas pruebas:

| Origen | Observación | Prioridad |
| --- | --- | --- |
| Etapa 7 | Balance de situación muestra pasivo y patrimonio en negativo (`débito − crédito` para todos los tipos). Igual en Contabilidad, así que no hay contradicción entre pantallas; corregirlo toca el PDF de EEFF validado contra un estado real | Media |
| Etapa 7 | El KPI de "gasto del mes" del panel financiero sigue saliendo del módulo de Gastos, no del libro diario | Baja |
| Etapa 8 | Las Server Actions no tienen prueba dinámica por HTTP (no se resolvió la codificación RSC de Next); el hallazgo 8.2 se sostiene en el código | Media |
| Etapa 8 | `AuditLog.device` fijo en "Escritorio"; `ip` y `userAgent` sin capturar | Baja |
| Etapa 8 | Las bitácoras no tienen política de retención | Baja |
| Etapa 9 | `nextExpenseNumber` sigue usando `MAX + 1` (riesgo de consecutivo interno repetido; el fiscal ya es atómico) | Baja |

---

# Criterio final, punto por punto

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| Los cálculos son correctos | ✅ | 36 cifras a mano, 0 discrepancias |
| Los datos son consistentes | ✅ | pantalla, servicio y Excel dan el mismo número |
| Existe una única fuente de verdad | ✅ | Presupuesto ejecutado = Egresos = Resumen, en los tres |
| Cada condominio está aislado | ✅ | 12 validaciones + RLS + 403 por HTTP |
| Un condominio nuevo comienza desde cero | ✅ | los tres nacen en 0 con su propio plan de 34 cuentas |
| Los permisos funcionan | ✅ | 13 pruebas HTTP con 3 roles |
| Existe trazabilidad | ✅ | rastro con valor anterior y nuevo por condominio |
| Los reportes coinciden | ✅ | consolidado, acotado, morosidad y Excel |
| Pruebas multi-condominio satisfactorias | ✅ | A ≠ B ≠ C en las 10 dimensiones |

**El módulo de Finanzas queda APROBADO CON OBSERVACIONES.** Ninguna observación
afecta la corrección de un cálculo ni el aislamiento entre condominios. OBS-1
merece atenderse antes de que el sistema se use para presentar cifras a una junta
directiva.

## Estado de los datos de prueba

Los tres condominios quedaron en la base para inspección manual. Para borrarlos:

```bash
npx tsx --env-file=.env scripts/probar-etapa10.ts --limpiar
```

Ningún dato de los condominios preexistentes fue modificado.


---

# Correcciones aplicadas (2026-08-19, posteriores al veredicto)

| Observación | Estado |
| --- | --- |
| OBS-1 · Excel de Reportes entregaba otro condominio en silencio | ✅ **CORREGIDA** |
| OBS-2 · Reporte vacío sin identificación | ✅ **CORREGIDA** (el encabezado lo resuelve) |
| Etapa 7 · Balance con pasivo y patrimonio en negativo | ✅ **CORREGIDA** |
| Etapa 7 · Panel financiero mezcla caja y devengo | ✅ **Rotulado sin ambigüedad** |
| Etapa 8 · `ip` y `user_agent` sin capturar | ✅ **CORREGIDA** |
| Etapa 8 · `AuditLog.device` fijo en "Escritorio" | ⬜ pendiente |
| Etapa 8 · Server Actions sin prueba dinámica por HTTP | ⬜ pendiente |
| Etapa 8 · Bitácoras sin política de retención | ⬜ pendiente (decisión de producto) |
| Etapa 9 · `nextExpenseNumber` con `MAX + 1` | ⬜ **reevaluada a baja** |

**OBS-1.** El condominio se resuelve una sola vez y un id explícito fuera de los
permitidos responde **403**, igual que las tres rutas hermanas. Cada Excel lleva
además un encabezado con el condominio, el período y la moneda, y el nombre del
archivo incluye el código (`reporte-egresos-e10a-2026-08-19.xlsx`). Verificado en
vivo: supervisor de A pidiendo B → 403; pidiendo un condominio de otra empresa →
403; su propio condominio → 200 con el encabezado correcto; el consolidado sigue
funcionando y se rotula "Consolidado — …".

**Balance.** El PDF de estados financieros ya presentaba pasivo y patrimonio en
positivo; las dos pantallas que leen la misma vista, no. Nuevo
`domain/balance-presentacion.ts` con el criterio único (9 pruebas). Verificado:
"Proveedores por Pagar" pasó de −₡345 000 a ₡345 000, y "Depreciación Acumulada"
sigue en negativo, que es lo correcto para una cuenta que resta del activo.

**Panel financiero.** No se redefinió qué mide —esa es una decisión de producto—:
se rotuló para que no se confunda con el resultado contable. "Cobrado en el mes ·
Pagos aplicados", "Gastos del mes · Módulo de Gastos", "Diferencia del mes ·
Cobrado − gastos. No es el resultado contable".

**`nextExpenseNumber`.** Reevaluada a **baja**: la tabla tiene
`@@unique([condominiumId, expenseNumber])`, así que una carrera **falla** en vez
de duplicar. Es un problema de robustez (el segundo usuario ve un error), no de
integridad. No se reestructuró la transacción de creación de gastos por eso.
