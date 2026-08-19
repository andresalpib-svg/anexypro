# Auditoría Etapa 8 — Seguridad, permisos y auditoría financiera

Fecha: 2026-08-19

Alcance pedido: validar los permisos de cada rol; que el backend valide
usuario + condominio + permiso + recurso sin confiar en el frontend; registrar
usuario, fecha, hora, acción, registro, valor anterior y valor nuevo en las
operaciones sensibles; evitar la eliminación física de movimientos financieros
históricos; y probar el acceso desde el frontend, desde la API directa, con
usuario sin permiso y desde otro condominio.

## Cómo se verificó

```bash
npx tsx --env-file=.env scripts/preparar-etapa8.ts        # un usuario por rol
node scripts/atacar-etapa8.mjs                            # 32 intentos de acceso
npx tsx --env-file=.env scripts/probar-etapa8-trazabilidad.ts   # 16 comprobaciones
```

`preparar-etapa8.ts` crea un usuario por cada rol con clave conocida. El
supervisor queda asignado **a un solo condominio** a propósito: es el caso que
revela si el backend cruza usuario contra condominio o si se conforma con el id
que viene en la petición.

`atacar-etapa8.mjs` inicia sesión por HTTP como cada rol —sin navegador, que es
justamente el punto— y golpea las rutas del servidor con parámetros que la
interfaz nunca mandaría: el condominio de otro, el módulo que no le toca, el
condominio de otra empresa administradora. Cada caso declara si se espera
rechazo o paso; un rechazo que devuelve 200 con datos es un hallazgo.

Resultado final: **32 intentos con el resultado esperado, 0 sin él** y **16
comprobaciones de trazabilidad, 0 fallos**. La suite pasó de 399 a 406 pruebas.

## Hallazgos

### 8.1 — `/api/finanzas/properties` entregaba la morosidad a cualquiera (CORREGIDO · grave)

La ruta solo comprobaba que hubiera sesión. Encima llevaba escrito el motivo:

```
// TODO: Verificar que el condominio pertenezca a la empresa del usuario
// Por ahora, la validación ocurre en el formulario (makePaymentAction)
```

La validación no ocurría en ninguna parte: `condoId` viaja en la URL. Confirmado
por HTTP, **cualquier usuario con sesión** obtenía el saldo, los meses de atraso,
el estado de suspensión y el nombre del propietario de **todas** las filiales de
**cualquier** condominio de la empresa:

| Quién | Qué pidió | Antes | Ahora |
| --- | --- | --- | --- |
| Supervisor de A | filiales del condominio B | 200 con datos | 403 |
| Condómino | filiales de su condominio | 200 con datos | 403 |
| Oficial de caseta | filiales del condominio | 200 con datos | 403 |

Un condómino podía leer la deuda de sus vecinos con una sola URL.

Corrección: la ruta ahora exige sesión, permiso de Finanzas (`can`) —lo que
además deja fuera a `condomino` y `seguridad`, que no son roles del panel— y que
el condominio esté entre los que esa sesión puede ver
(`listCondominiumsForSession`). Es la misma terna que aplica `requirePanel`.

### 8.2 — Los guards propios de Finanzas ignoraban la grilla de permisos (CORREGIDO)

Nueve archivos de acciones tenían su propio `guard()` con la lista de roles y el
`canAccessCondo`, sin pasar por `requirePanel`. A ese guard le faltaban dos
cosas: consultar la grilla de permisos (`can`) y cerrar el paso a una empresa
demo vencida.

Consecuencia: revocarle **Finanzas** a un supervisor en Configuración le quitaba
el módulo del menú y le cerraba la pantalla —verificado: `/app/finanzas/gastos`
responde 307— pero no le cerraba las Server Actions, que son endpoints HTTP que
se invocan sin pasar por la pantalla. Lo mismo con **Mantenimientos** en Activos
y Caja chica, y con **Documentos** en el Repositorio.

Corrección: los guards ahora delegan en `requirePanel({ area, roles,
condominiumId })` en vez de reimplementarlo. Archivos tocados: `finanzas/gastos`,
`finanzas/cobranza`, `finanzas/fondos`, `finanzas/inversiones`, `finanzas/bancos`,
`finanzas/asistente`, `activos`, `mantenimiento/petty-cash`, `repositorio`. Dos
acciones sueltas de Gastos (alta de proveedor y lectura del XML de factura) que
comprobaban el rol a mano quedaron igual.

> Nota honesta sobre la evidencia: **este hallazgo se sostiene en el código, no
> en una prueba dinámica.** Intenté invocar la Server Action por HTTP para
> demostrarlo de punta a punta y no logré reproducir la codificación del
> protocolo RSC de Next — el intento tampoco funcionó con los permisos
> restaurados, así que no prueba nada y no se cuenta como evidencia. Lo que sí
> está verificado es la asimetría: la pantalla rechaza (307) y el guard, leído,
> no consultaba `can` en ningún momento.

### 8.3 — Los movimientos de fondo se borraban de verdad (CORREGIDO)

`deleteFundMovement` hacía un `DELETE` físico. El saldo del fondo cambiaba y no
quedaba rastro de que el aporte o el uso hubiera existido, ni de quién lo quitó
ni por qué. Tratándose de un fondo de reserva —dinero aprobado en asamblea— es
exactamente lo que la etapa pide evitar.

### 8.4 — La caja chica se borraba, y sin registrar nada (CORREGIDO)

`deletePettyCashExpense` y `deletePettyCashAllocation` borraban físicamente, y
además **no llamaban a `logActivity`** — siendo que el alta sí lo hacía. Un gasto
de caja chica podía desaparecer sin dejar ninguna huella en ninguna bitácora.

**Corrección de 8.3 y 8.4**: migración `20260819_anulacion_movimientos` agrega
`voided_at`, `void_reason` y `voided_by` a `fund_movements`,
`petty_cash_expenses` y `petty_cash_allocations`, con índices parciales para que
el saldo no recorra lo anulado. Las funciones pasaron a llamarse
`voidFundMovement`, `voidPettyCashExpense` y `voidPettyCashAllocation`: exigen un
motivo de al menos 5 caracteres, dejan doble rastro (bitácora de actividad y
rastro de cambios) y el movimiento **deja de sumar pero sigue estando**. Es el
mismo criterio que ya usaban los gastos (`expenses.voided_at`) y los cargos
(`charges.status`).

En pantalla el movimiento anulado aparece tachado, con su motivo; el botón de
papelera pasó a ser uno de anular que pide el motivo. En el PDF de caja chica el
gasto anulado sigue listado, marcado, y no arrastra su factura a los anexos.

Verificado contra la base: anular devuelve el saldo a su valor previo, la fila
sigue existiendo con motivo y responsable, y el informe la sigue mostrando.

### 8.5 — El rastro de "valor anterior / valor nuevo" no existía (IMPLEMENTADO)

La bitácora de actividad (`AuditLog`) responde quién, cuándo, qué acción y sobre
qué registro — pero nunca qué **valía antes**. El modelo `SystemAuditEntry`
(tabla `audit_logs`) estaba en el esquema desde el inicio, con su columna
`changes` y su RLS puesta, y **nadie escribía en él**: estaba vacío.

Implementado `src/lib/services/audit-trail.ts` (`logChange`, `diffCampos`), que
escribe dentro de la misma transacción de la operación auditada —si la operación
se revierte, su rastro se revierte con ella— y conectado a las operaciones
sensibles:

| Operación | Qué queda registrado |
| --- | --- |
| Gasto anulado | `status: aprobado → anulado`, copia del gasto, motivo |
| Cargo anulado | `status → anulado`, filial, tipo, monto, vencimiento, motivo |
| Movimiento de fondo anulado | fondo, tipo, monto, fecha, descripción, motivo |
| Caja chica anulada | detalle/nota, monto, fecha, motivo |
| Presupuesto guardado | por partida: `5303 · Seguridad: 250 000 → 999 000` |
| Permiso de usuario | `finanzas: true → false` |
| Área de Junta Directiva | `finanzas: false → true` |

`Auditoría` ganó una segunda pestaña, **Cambios (antes / después)**, que lo
muestra en el vocabulario del negocio —no la tabla cruda— con el motivo cuando lo
hay. Sin esa pantalla el rastro sería de solo escritura y no serviría de nada.

### 8.6 — La CSP de desarrollo (CORREGIDO en la Etapa 7)

Ya corregida el 18/8; se menciona porque sin ella no se puede probar nada
localmente. Producción conserva la política estricta.

## Lo que ya estaba bien

Verificado por HTTP, no por lectura:

- **Roles del panel**: un condómino y un oficial de caseta no abren Finanzas,
  Auditoría ni Configuración; el contador no abre Residentes ni Seguridad; el
  supervisor no abre Configuración (reservada al titular). Todos rechazados por
  el backend con redirección, no por ocultar el menú.
- **Panel de plataforma**: ni el administrador, ni el supervisor, ni el condómino
  entran a `/master`.
- **Portales cruzados**: la caseta no abre el estado de cuenta del residente; el
  condómino no abre el portal de la caseta.
- **Otro condominio**: las descargas de Finanzas, morosidad, EEFF y caja chica
  rechazan con 403 el condominio no asignado, y también el de otra empresa
  administradora.
- **Tareas automáticas**: `/api/cron` responde 401 sin secreto, y también cuando
  lo dispara un condómino o un supervisor con sesión válida.
- **RLS**: una consulta hecha fuera de `withTenantContext` **falla** en vez de
  devolver una lista vacía — comprobado sin querer al escribir los guiones de
  esta auditoría, que es exactamente el comportamiento buscado.
- **Guards**: solo `/demo` y `/recuperar` no tienen guard, y son públicos a
  propósito (ambos con freno por intentos).
- `resolveCondoId` descarta un `condoId` que no esté entre los de la sesión.

## Pendiente (fuera del alcance de esta etapa)

- **Prueba dinámica de Server Actions**: sigue sin cubrirse por HTTP. Vale la
  pena resolver la codificación RSC —o exponer los guards a una prueba de
  integración— para que un hueco como el 8.2 falle en pruebas y no dependa de que
  alguien lea el archivo.
- **`AuditLog.device`** está fijo en `'Escritorio'`: no hay detección real, así
  que ese campo hoy no informa nada. Tampoco se guardan `ip` ni `userAgent` en
  `SystemAuditEntry`, que sí tiene las columnas.
- **Eliminaciones físicas que quedan y no son movimientos**: gastos recurrentes y
  contratos (plantillas), categorías de activos, tareas y adjuntos. Un
  `RecurringExpense` borrado deja huérfano el `Expense.recurringId` de los gastos
  que generó — conviene revisarlo, aunque no altera ningún saldo.
- **Purga de la bitácora**: ni `audit_log` ni `audit_logs` tienen política de
  retención. Crecen sin límite.
