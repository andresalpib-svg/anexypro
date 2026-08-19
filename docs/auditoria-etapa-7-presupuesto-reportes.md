# Auditoría Etapa 7 — Presupuesto y Reportes financieros

Fecha: 2026-08-18

Alcance pedido: implementar/corregir el presupuesto (condominio, período,
categoría, monto presupuestado, ejecutado, variación) y los diez reportes
financieros; garantizar una sola fuente de datos; verificar el aislamiento entre
condominios; y comprobar contra los movimientos registrados que los totales
coincidan exactamente.

## Cómo se verificó

`scripts/auditar-etapa7.ts` siembra movimientos controlados en dos condominios de
prueba (`Etapa7 Test A` y `Etapa7 Test B`, montos distintos en cada uno), calcula
a mano lo que cada reporte debería mostrar y lo compara con lo que devuelven los
mismos servicios que usan la pantalla y el Excel:

```bash
npx tsx --env-file=.env scripts/auditar-etapa7.ts
```

Datos sembrados por condominio: dos filiales con cargos y un pago parcial; cinco
gastos (aprobado, aprobado, por aprobar, anulado y uno del año anterior); un
gasto imputado a un proyecto; presupuesto en dos partidas; un fondo con aporte y
compromiso; una inversión con su interés; un activo con dos meses de
depreciación; y un ticket de mantenimiento completado con costo.

Resultado: **83 comprobaciones, 0 fallos**. Se verificó además en el navegador
(pantallas) y descargando las 14 hojas de Excel.

## Hallazgos

### 7.1 — Reportes → Proyectos mostraba ₡0 gastado (CORREGIDO)

`getProjectsReport` sumaba únicamente la tabla `ProjectExpense`, el módulo de
gastos de proyecto que se retiró cuando ese trabajo pasó a Finanzas. Un proyecto
financiado por la vía actual —un gasto de Finanzas imputado con
`Expense.projectId`— aparecía con **"Gastado ₡0"** en Reportes mientras el
tablero de Proyectos mostraba el monto real, el mismo día y para el mismo
proyecto.

Corrección: el reporte usa `projectSpent()`, la misma función del módulo.
Verificado: Obra A ₡0 → ₡150 000; Obra B ₡0 → ₡22 000.

### 7.2 — Presupuesto y Egresos ignoraban un 16 % del gasto real (CORREGIDO)

"Cuánto gastó este condominio" se respondía de dos maneras según la pantalla:

| Pantalla | Fuente | Total (condominio A) |
| --- | --- | --- |
| Presupuesto → Ejecutado | módulo de Gastos | ₡430 000 |
| Reportes → Egresos | módulo de Gastos | ₡430 000 |
| Reportes → Resumen (Resultado) | ingresos del libro − gastos del módulo | −₡255 000 |
| Estado de Resultados | libro diario | ₡514 000 |
| Reportes → Depreciaciones | libro diario | ₡40 000 |
| Reportes → Mantenimiento | tickets | ₡44 000 |

El libro diario contabiliza gasto que **nunca pasa por el módulo de Gastos**: la
depreciación mensual de los activos (cuenta 5902) y el costo de un ticket de
mantenimiento completado (cuenta 5003). Consecuencias:

- "Resumen financiero" declaraba un resultado de −₡255 000 cuando el resultado
  contable era −₡339 000, y las pestañas de al lado mostraban las piezas que
  faltaban.
- En Presupuesto, la partida "Mantenimiento General" marcaba **₡0 ejecutado**
  aunque un ticket ya se hubiera comido ₡44 000 de ella: el administrador creía
  tener disponible un dinero que ya estaba gastado.

Corrección: se creó `expense-ledger` (`domain/` para la agregación,
`services/` para la consulta) como **única definición del gasto del
condominio** — asientos confirmados contra cuentas de tipo `gasto`, en dos cortes
del mismo total: por cuenta contable (lo que ejecuta cada partida) y por origen
(de qué módulo salió). Lo consumen `getBudget`, `getEgresosReport` y
`getResumenFinanciero`.

El criterio "solo lo aprobado o pagado" no cambió: un gasto en borrador o por
aprobar no tiene asiento, y `voidExpense` marca el suyo como anulado.

`Reportes → Egresos` sigue mostrando el detalle factura por factura del módulo de
Gastos con su subtotal (que cuadra con `Finanzas → Gastos`), y debajo el resto
del gasto contabilizado hasta el total del año. Si el detalle no coincidiera con
lo que el libro diario atribuye al módulo, la pantalla lo dice en vez de callarlo
(`descuadre`).

Verificado tras el cambio, en A: Presupuesto ejecutado = Egresos total = Resumen
egresos = ₡514 000, y resultado = ₡175 000 − ₡514 000 = −₡339 000.

### 7.3 — Tres copias del literal `['aprobado','pagado']` (CORREGIDO)

`expenses.ts`, `projects.ts`, `financial-dashboard.ts` y `financial-assistant.ts`
repetían el mismo literal. El día que una cambiara, Proyectos, Presupuesto, el
panel y el asistente habrían empezado a contar cosas distintas sin que nada
fallara. Ahora las cuatro usan `EXECUTED_EXPENSE_STATUSES`.

### 7.4 — La CSP de desarrollo impedía arrancar la aplicación local (CORREGIDO)

La política con `strict-dynamic` bloqueaba el recargado en caliente de Next
(`Evaluating a string as JavaScript violates...`) y la pantalla se quedaba en el
logo: no se podía verificar nada en el navegador. Se afloja **solo** cuando
`NODE_ENV === 'development'` (`'unsafe-eval'`, `ws:` para el socket de recarga, y
sin `upgrade-insecure-requests`, que manda a https un servidor local que habla
http). La política de producción queda intacta.

### 7.5 — Detalles de presentación (CORREGIDOS)

- Reportes → Proyectos mostraba el valor crudo del enum (`en_progreso`) mientras
  el Excel del mismo reporte mostraba "En progreso".
- Una partida sin presupuesto con ejecución mostraba "0 %", que se lee como "no
  se gastó nada"; ahora dice "sin presupuesto" (pantalla y Excel).

## Lo que ya estaba correcto

Verificado contra los movimientos sembrados, sin encontrar diferencias:

- **Presupuesto**: pertenece a un único condominio; registra período, categoría
  (cuenta del plan de cuentas del condominio), monto presupuestado, ejecutado y
  variación. El gasto anulado y el que está por aprobar no ejecutan. El "año
  anterior" toma solo el año anterior.
- **Morosidad**: `Reportes → Morosidad` y `Finanzas → Cobranza` usan `buildAging`,
  la misma fuente (corregido en la Etapa 2, Fase 3). Total = facturado − recaudado.
- **Intereses** = cuenta 4902 del libro diario. **Depreciaciones** = cuenta 5902.
- **Fondos**: operativo + comprometido + invertido = total, y el interés vuelve al
  fondo de origen.
- **Multi-condominio**: los diez reportes respetan el condominio seleccionado; un
  `condoId` de otra empresa no devuelve datos ajenos — `resolveCondoId` lo
  descarta y cae al condominio propio. El consolidado se recorta a los
  condominios que la sesión puede ver.
- Las 14 hojas de Excel salen de los mismos servicios que la pantalla.

## Pendiente (fuera del alcance de esta etapa)

- **Signo del balance de situación**: `v_balance_general` calcula `débito −
  crédito` para todos los tipos, así que pasivo y patrimonio salen en negativo
  (₡−520 000 de "Proveedores por Pagar"). `Reportes → Resumen` y
  `/app/contabilidad` lo muestran igual, así que no hay contradicción entre
  pantallas, pero la presentación es incorrecta. Cambiarlo toca también el PDF de
  EEFF, que se validó contra un estado financiero real: merece su propia pasada.
- **Panel financiero**: el KPI de "gasto del mes" sigue saliendo del módulo de
  Gastos mientras la tarjeta de presupuesto ya usa el libro diario. Son
  granularidades distintas (mes vs. año) y hoy no se contradicen en pantalla,
  pero conviene unificarlas en la próxima pasada del panel.
