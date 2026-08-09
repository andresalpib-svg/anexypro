# Prueba de uso real por rol — 8 de agosto de 2026

Recorrido manual de los 4 roles (administrador, supervisor, residente y seguridad) usando
los módulos como los usaría una administradora, sobre el entorno local
(`anexypro-app 10`, Postgres embebido en 5433, datos de "Residencial Altamar (Demo)").

**Usuario creado para la prueba**: una cuenta de condómino a nombre del dueño del proyecto,
**propietaria de CASA-14** en Residencial Altamar (Demo). Se creó desde el panel (Propiedades
y Residentes → CASA-14 → Agregar persona con contraseña), que es el mismo camino que usa la
administradora. El correo y la contraseña se entregaron aparte: este archivo va al
repositorio y no es lugar para credenciales.

---

## Lo que se hizo, no solo lo que se miró

| Rol | Acciones ejecutadas de verdad |
|---|---|
| Administrador | Creó tarea con condominio y fecha límite · Redactó, guardó y **publicó** un comunicado (15 destinatarios) · Creó evento de calendario para condóminos · Registró un gasto de caja chica con factura adjunta · Creó a Andrés en CASA-14 · **Emitió el incumplimiento INC-2026-0018** (PDF + correo real) · Asignó al supervisor a Altamar · Registró un pago de ₡231 350 · Descargó el Excel de Reportes |
| Supervisor | Entró sin condominios asignados y luego con Altamar asignado · Intentó forzar `condoId` de otro condominio · Intentó entrar a Finanzas y Configuración |
| Residente (nuevo) | Vio el aviso de suspensión · Consultó el estado de cuenta · **Solicitó el estado de cuenta formal** · Intentó autorizar una visita estando suspendido · Confirmó la lectura del incumplimiento · Ya al día: **autorizó la visita J2G58R** y **reservó el Gimnasio** |
| Seguridad | Panel de turno · Buscó y registró **INGRESO y SALIDA** de la visita J2G58R · Buscó a Andrés en Control de Acceso · **Reportó un incidente** · Revisó bitácora, paquetería y reservas |

Todo el circuito de punta a punta funcionó: portal → caseta → bitácora, y
emisión de incumplimiento → PDF en el repositorio → portal del residente → acuse de lectura.

---

## Estado de los arreglos

**Los 22 hallazgos están corregidos y comprobados.** `tsc --noEmit` queda limpio y las
pruebas pasan: **253**, con 17 nuevas que fijan las reglas que se corrigieron (fechas de solo
fecha, nombres de archivo, formato de moneda y teléfonos).

---

## Hallazgos que afectan a producción HOY

### 1. Los nombres de archivo con tildes o ñ se guardan corrompidos — CORREGIDO
**Reproducido en vivo.** Subí `factura ñandú agosto.png` en caja chica y quedó guardado y
mostrado como `factura Ã±andÃº agosto.png`. Lo mismo ya está en los datos viejos
(`Captura de pantalla … 3.27.23â¯p.â¯m..png`) y en la bitácora de Auditoría.

En Costa Rica prácticamente todo adjunto lleva tilde o ñ, así que el repositorio —y su copia
en Google Drive— se llena de nombres ilegibles.

- Causa: el nombre del multipart llega decodificado como latin-1; se usa tal cual en
  [`src/lib/services/file-refs.ts:104`](../src/lib/services/file-refs.ts) (`fileName: file.name`).
- Arreglo: reinterpretar el nombre (`Buffer.from(file.name,'latin1').toString('utf8')` cuando
  el resultado es UTF-8 válido) en ese único punto — cubre los 21 puntos de subida.

### 2. Los campos de fecha se autocompletan con MAÑANA después de las 6 p.m. — CORREGIDO
**Reproducido en vivo.** A las 9:04 p.m. registré un gasto de caja chica y quedó fechado
**09 ago 2026** siendo 08 de agosto. Nadie lo nota: el campo ya viene lleno.

Son componentes de cliente, así que corren con la hora del navegador del usuario (Costa Rica,
UTC−6): de 6:00 p.m. en adelante todos proponen el día siguiente.

- [`app/mantenimiento/petty-cash.tsx:56`](../src/app/app/mantenimiento/petty-cash.tsx)
- [`app/finanzas/gastos/expense-board.tsx:49`](../src/app/app/finanzas/gastos/expense-board.tsx)
- [`app/finanzas/recurrentes/recurring-board.tsx:71`](../src/app/app/finanzas/recurrentes/recurring-board.tsx)
- [`app/finanzas/cobranza/collections-board.tsx:66`](../src/app/app/finanzas/cobranza/collections-board.tsx)
- [`app/finanzas/presupuesto/reserve-panel.tsx:32`](../src/app/app/finanzas/presupuesto/reserve-panel.tsx)
- [`app/finanzas/bancos/reconciliation-board.tsx:133`](../src/app/app/finanzas/bancos/reconciliation-board.tsx)
- [`master/suscripciones/subscription-table.tsx:325`](../src/app/master/suscripciones/subscription-table.tsx)

Arreglo: componer la fecha con `getFullYear/getMonth/getDate` locales, nunca con `toISOString()`.

### 3. Visitas: el tipo "empleado" y el estado "suspendida" salen en blanco — CORREGIDO
En **Control de Visitas** del panel, Pedro Rojas Núñez y Marta Solís Campos (ambos
`visitType: empleado`) muestran la columna **Tipo vacía**, y Marta —`status: suspendida`—
muestra la columna **Estado vacía**. Los diccionarios se quedaron sin los valores que se
agregaron cuando se rehízo el módulo de visitas:
[`src/app/app/visitas/page.tsx:13-15`](../src/app/app/visitas/page.tsx).

La caseta sí los rotula bien; el problema es solo la vista de administración.

### 4. La suspensión de servicios ignora el convenio de pago vigente — CORREGIDO
CASA-14 tiene un **convenio de pago vigente** (visible en Finanzas → Cobranza) y aun así
aparecía "Suspendida (3m)": el residente no podía reservar, ni autorizar visitas, ni usar el
Árbitro Legal.

`getPropertySuspension` ([`src/lib/services/finance.ts:37-61`](../src/lib/services/finance.ts))
solo cuenta cuotas ordinarias vencidas; no consulta `PaymentPlan`, aunque el interés moratorio
y la escalera de cobranza sí lo respetan. Un condómino que negoció y está pagando queda
igual de castigado que uno que no responde.

### 5. El asiento contable del cargo se registra en la fecha de VENCIMIENTO — CORREGIDO
`recordChargeAccrual` usa `period ?? dueDate` como fecha del asiento
([`src/lib/services/accounting.ts:110`](../src/lib/services/accounting.ts)). Una multa no tiene
período, así que las multas emitidas el **2 de agosto** quedaron asentadas con vencimiento
**1.º de setiembre** — es decir, el ingreso por multas de agosto aparece en setiembre.

Si además se cierra el mes, el ingreso ya se reconoció en otro período. El devengo debería ir
en la fecha de emisión.

---

## Hallazgos de severidad media

### 6. Un supervisor sin condominio asignado se queda sin sistema, y con un mensaje falso — CORREGIDO
Al entrar sin asignaciones:
- El panel dice **"0 tareas pendientes"** aunque tiene 2 asignadas a su nombre (el módulo
  Gestión sí las muestra). `getSupervisorDashboard` corta en seco cuando no hay condominios
  ([`src/lib/services/supervisor-dashboard.ts:21-29`](../src/lib/services/supervisor-dashboard.ts)),
  pero las tareas no se filtran por condominio.
- Los 18 módulos muestran **"Primero crea un condominio en Gestión de Condominios."** — un
  supervisor no puede crear condominios y ni siquiera ve ese módulo. El mensaje correcto es
  "todavía no tenés condominios asignados". (18 archivos bajo `src/app/app/`.)

Con el condominio asignado todo funciona bien y el alcance se respeta: no pudo forzar
`?condoId=` de otro condominio ni entrar a Finanzas o Configuración.

### 7. El panel financiero cuenta borradores como "esperan aprobación" — CORREGIDO
El Panel muestra **1** ("#2 Mantenimiento de jardines") y la pestaña Gastos muestra **0**,
porque ese gasto está en *borrador*. El panel lista `pendingApproval`, que incluye borradores
([`financial-dashboard.ts:71`](../src/lib/services/financial-dashboard.ts) +
[`finanzas/panel/page.tsx:206`](../src/app/app/finanzas/panel/page.tsx)); la alerta de la misma
pantalla sí filtra bien. Dos números distintos para lo mismo.

### 8. Dos facturas de caja chica tienen el enlace roto (404) — CORREGIDO
`petty_cash_expenses.invoice_url` conserva 2 rutas `/uploads/caja-chica/…` de la época en que
las subidas eran públicas. Esa carpeta ya no existe: comprobado, devuelven **404**. Es la única
columna de la base que quedó con rutas viejas.

### 9. Proyectos: el gasto ejecutado siempre dirá ₡0 — CORREGIDO
El kanban muestra "₡0 de ₡2 100 000" en todos los proyectos porque suma `ProjectExpense`
([`proyectos/page.tsx:61`](../src/app/app/proyectos/page.tsx)), y la UI para registrar esos
gastos se eliminó cuando el gasto de proyecto pasó a Finanzas. **Corrección respecto de la primera versión de este informe**: escribí que
`Expense.projectId` ya existía; no es así — el `projectId` que vi pertenece a `FeeBatch`
(el financiamiento por cuota extraordinaria). Un gasto de Finanzas **no puede** atribuirse
hoy a un proyecto.

### 10. "Visitas por ingresar" incluye a quienes ya están adentro — CORREGIDO
De las 5 filas del bloque, 3 dicen "Adentro" y traen botón *Registrar salida*, y una está
"Vencida". El corte real es "no ha salido todavía"
([`visitas/page.tsx:29-34`](../src/app/app/visitas/page.tsx)); el rótulo debería ser
"Visitas activas".

### 11. El residente nuevo no ve ningún comunicado anterior — CORREGIDO
El portal de Andrés dice "Sin comunicados todavía" aunque el condominio tiene 3 comunicados
publicados a "Todos los residentes" (uno de hoy). La entrega es una foto de los destinatarios
al momento de publicar. Decisión de producto a confirmar: un propietario que entra hoy no
tiene forma de enterarse de lo que se avisó el mes pasado.

### 12. El aviso de suspensión aparece en un módulo y en los otros dos no — CORREGIDO
El Árbitro Legal avisa antes ("Bloqueado por suspensión de servicios"). Visitas y Reservas
muestran el formulario completo y solo fallan al enviar. El bloqueo del servidor funciona bien
en los tres; lo que falta es el aviso previo en dos de ellos.

---

## Hallazgos menores y riesgos latentes — TODOS CORREGIDOS

13. **Fechas de tipo "solo fecha" renderizadas con la zona del servidor.** Localmente vi la
    reserva que hice para el **14/8** mostrada como **13/8**, el estado de cuenta con
    vencimientos al día 14 cuando el condominio vence el 15, y el Libro Diario un día antes.
    En Vercel el servidor corre en UTC y sale bien, así que **hoy producción no lo sufre**;
    pero el código depende de la zona del servidor y se rompe el día que cambie o se
    autohospede. Afecta: `portal/estado-cuenta/page.tsx:138`, `portal/reservas/page.tsx:76`,
    `app/reservas/page.tsx:110`, `app/contabilidad/page.tsx:95`,
    `documento/[id]/page.tsx:31,155` (el documento formal que se entrega) y las asambleas.
    Se corrige con `{ timeZone: 'UTC' }`, como ya se hace en otros 13 puntos.
14. **`generateOrdinaryBilling` con zona horaria de Costa Rica factura el mes equivocado.**
    Con `TZ=America/Costa_Rica`, el período agosto-2026 genera descripción
    *"Cuota ordinaria julio de 2026"* y vencimiento **16/7/2026** — un cobro que nace vencido,
    dispara interés moratorio y puede suspender servicios.
    `period.toLocaleDateString` y `dueDate.setDate()` en
    [`finance.ts:112-125`](../src/lib/services/finance.ts) usan hora local. Hoy no pasa porque
    Vercel corre en UTC. Conviene fijarlo en UTC antes de que alguien defina `TZ`.
15. **Auditoría no registra la creación de usuarios.** Crear la cuenta de Andrés no dejó
    rastro en el módulo Auditoría (sí en la actividad del dashboard, que es otra tabla).
    Tampoco cubre Gestión de Tareas, Calendario, Reservas ni Visitas —`AUDIT_MODULES` no las
    incluye. Dar de alta un acceso es justo lo que una bitácora debe registrar.
16. **`CRC 25.000,00` en el portal del residente.** En la notificación de incumplimiento el
    monto usa punto de miles; el resto del sistema usa `₡25 000,00`. El rodeo de "CRC" existe
    por una limitación del PDF, pero en pantalla no hace falta.
17. **La bitácora de la caseta muestra el valor crudo**: "Juan Prueba QA — rapida",
    "— empleado", en vez de "Visita rápida" / "Empleado".
18. **Permanencia en minutos sin convertir**: "Dentro del condominio · 25924 min" (18 días).
19. **Código muerto**: `src/app/seguridad/visitas/new-visit-form.tsx` no lo importa nadie (la
    caseta usa `caseta.tsx`). Conviene borrarlo antes de que alguien lo corrija creyendo que
    está vivo.
20. **Basura de pruebas en la base local**: 2 empresas `ZZ PRUEBA FUGA RLS` y el condominio
    `Condo Fuga`, de la verificación de RLS.
21. **`listAssignableUsers` ofrece asignar administradores como supervisores del condominio**
    ([`condominiums.ts:159`](../src/lib/services/condominiums.ts)); un `admin_owner` ve todo de
    todas formas, así que la asignación no hace nada y confunde.
22. **No hay validación de teléfono**: los datos demo tienen números de 9 dígitos
    (`87013-1071`) que el sistema aceptó sin chistar.

---

## Cosas que quedaron bien (vale la pena decirlo)

- El aislamiento por rol y por condominio aguanta: el supervisor no pudo forzar otro
  condominio por URL, ni entrar a Finanzas ni a Configuración.
- Los bloqueos por morosidad se comprueban en el servidor, no escondiendo el botón, y el
  mensaje explica el motivo y el camino de salida.
- La certificación de cuotas al día se negó sola, con el motivo y el número de cobros
  atrasados.
- El plazo de 2 días hábiles calculó bien: solicitado el sábado 8 → estimado martes 11.
- El circuito de incumplimientos funcionó completo: expediente, PDF en el repositorio privado,
  correo, aviso en el portal y acuse de lectura con fecha.
- La caseta refleja bien los estados finos (adentro, vencida, suspendida, finalizada) y el
  ingreso/salida funcionó al primer intento.

---

## Notas de la corrida

- **Se envió un correo real** al condómino de prueba con la notificación de incumplimiento:
  el `.env` local sí tiene `RESEND_API_KEY`. Conviene tenerlo presente al probar en local —
  los envíos salen de verdad.
- A mitad de la prueba el Postgres embebido perdió permisos sobre su propio directorio de
  datos (`could not open file … Operation not permitted`) y la aplicación mostró la pantalla de
  error con el detalle de Prisma. Es la falla de entorno ya conocida; se recuperó con
  `kill -INT` + `node start-pg.mjs --restart`, sin pérdida de datos.
- Datos creados por la prueba y que conviene borrar si se quiere dejar la demo limpia: tarea
  "Prueba QA — revisar bomba de agua", comunicado y evento "Prueba QA …", gasto de caja chica
  "Prueba QA — tornillos y silicón", expediente INC-2026-0018, incidente de la luminaria,
  visita J2G58R, reserva del Gimnasio del 14/8 y el pago SINPE-QA-0001.

---

## Detalle de los arreglos (8 de agosto de 2026)

**1. Nombres de archivo.** `src/lib/nombre-subida.ts` → `decodeUploadName()`: reinterpreta los
bytes como UTF-8 y acepta el resultado **solo si es válido** (`TextDecoder` con `fatal: true`),
así que un nombre que de verdad venía en latin-1 se devuelve intacto. Se aplica en
`saveToRepository` y en los seis puntos que guardaban el nombre por su cuenta (repositorio,
incumplimientos, gastos, caja chica y los dos adjuntos de tareas). *Comprobado en vivo*: el
gasto viejo sigue diciendo `factura Ã±andÃº agosto.png` y el nuevo, en la misma pantalla, dice
`factura ñandú agosto.png`.

**2. Fechas.** `src/lib/fecha-local.ts` → `hoyISO()`, que arma la fecha con los componentes
**locales**. Reemplaza las siete copias de `new Date().toISOString().slice(0,10)`.
*Comprobado en vivo*: a las 9:58 p.m. del 8 de agosto (03:58 UTC del 9) el campo de caja chica
propone `2026-08-08`, y el gasto quedó registrado como `08 ago 2026`.

**3. Etiquetas de visitas.** Se completaron los cuatro tipos y los cinco estados en
`app/visitas/page.tsx`. *Comprobado en vivo*: las dos filas de empleados ya dicen "Empleado" y
la autorización suspendida muestra "Suspendida" en ámbar.

**4. Convenio de pago.** `getPropertySuspension` y `listPropertiesWithBalance` consultan ahora
`PaymentPlan` con estado `vigente` — el mismo criterio que ya usaban el interés moratorio y la
escalera de cobranza. La tabla de Cuotas y pagos muestra un estado propio, **"Convenio
vigente"**, para no confundirlo con estar al día. *Comprobado* armando el escenario en el
condominio de prueba: con 3 cuotas vencidas `suspended=true`; al registrar el convenio,
`suspended=false` y `hasPaymentPlan=true`.

**5. Fecha del asiento.** `recordChargeAccrual` recibe `issuedAt` (el `createdAt` del cargo) y
usa `period ?? issuedAt` en vez de `period ?? dueDate`. *Comprobado*: un cargo emitido hoy con
vencimiento 30/9 genera el asiento con fecha de hoy, no de setiembre. Ojo: la fecha se
normaliza a medianoche **UTC**, igual que el resto de columnas `@db.Date` del sistema — en
Vercel (UTC) coincide con el día real; en un servidor con zona de Costa Rica puede quedar un
día adelantado después de las 6 p.m., que es el hallazgo 13, todavía abierto.

**Pruebas nuevas**: `src/lib/__tests__/fecha-y-nombres.test.ts` (8 casos) cubre `hoyISO` y
`decodeUploadName` —incluida la idempotencia y el caso de un nombre que ya venía bien, que no
debe romperse—. Total: 244 pruebas, `tsc --noEmit` limpio.

---

## Detalle de los arreglos 6 a 12 (8 de agosto de 2026)

**6. Supervisor sin condominios.** Dos arreglos:
- `getSupervisorDashboard` ya no devuelve `pendingTasks: 0` en seco: las tareas se asignan a la
  persona, no al condominio, así que se cuentan igual. *Comprobado*: quitándole la asignación,
  el panel pasó de "0" a "2 tareas pendientes", que es lo que muestra el módulo Gestión.
- `<SinCondominio>` (`src/components/ui/sin-condominio.tsx`) reemplaza el mensaje único en los
  18 módulos y distingue las dos causas: **"No tenés condominios asignados — la empresa sí
  tiene condominios, pero a tu usuario no le han asignado ninguno"** frente a "Todavía no hay
  condominios", este último con botón de crear solo para el administrador.

**7. Borradores contados como pendientes de aprobación.** La consulta del panel pasó de
`status in ('por_aprobar','borrador')` a `status = 'por_aprobar'`. *Comprobado*: el panel ahora
dice 0, igual que la pestaña Gastos, sobre el mismo gasto en borrador.

**8. Enlaces muertos de caja chica.** Los archivos físicos ya no existen (comprobado en disco),
así que no hay nada que migrar: lo que se arregló es que la interfaz no ofrezca un enlace que
da 404. Con `isLegacyPublicRef` esas facturas se muestran como **"nombre · no disponible"**, sin
enlace. *Comprobado*: 0 anclas a `/uploads/` en la pantalla. Para que un componente de cliente
pudiera usar ese helper, las funciones que solo miran la forma de la referencia se movieron a
`src/lib/rutas-archivo.ts` (sin sesión ni Prisma); `file-refs.ts` las reexporta.

**9. Proyectos.** La tarjeta muestra **"Presupuesto ₡X"** cuando no hay ejecución registrada, y
"₡Y de ₡X" solo cuando la hay. *Comprobado*: los cuatro proyectos sin gasto muestran el
presupuesto y "Renovación del gimnasio" —el único con `ProjectExpense`— sigue mostrando
₡2 450 000 de ₡6 500 000. **Queda una decisión para Freddy**: si el gasto de proyecto ahora se
lleva en Finanzas, hay que agregar `Expense.projectId` y un selector en el formulario de gastos
para que la ejecución vuelva a alimentarse; eso es una funcionalidad nueva, no un arreglo.

**10. Rótulo de visitas.** "Visitas por ingresar" → **"Visitas activas — por ingresar y dentro
del condominio"**, y el historial → "Visitas cerradas — con ingreso y salida registrados".

**11. Comunicados anteriores al ingreso.** `listEarlierCommunications` devuelve los comunicados
enviados del condominio que **no** tienen entrega para esa persona, respetando la audiencia. Se
muestran en un bloque aparte, **"Publicados antes de tu ingreso"**, y de solo lectura: no se
fabrican destinatarios hacia atrás, porque eso ensuciaría el "entregado a 15 · leído por 3" que
la administración usa como constancia. *Comprobado en vivo*: Andrés ve los 4 anteriores; y con
una transacción revertida se verificó que alguien con rol `residente` vería solo los 3
dirigidos a "Todos", sin el que iba a "Solo Propietarios".

**12. Aviso de suspensión.** `<AvisoSuspension>` sustituye al formulario en Visitas y Reservas
cuando la unidad está suspendida, igual que ya hacía el Árbitro Legal. *Comprobado en vivo*
sobre CASA-14: con 3 cuotas vencidas aparece el aviso y desaparece el formulario en ambos
módulos; al restaurar el convenio de pago, vuelve el formulario — que de paso confirma el
arreglo 4 funcionando en el portal real.

Todo lo que se creó para verificar (cuotas de mora temporales, cambios de asignación y de
convenio) quedó restaurado; se comprobó por consulta que no queda nada.

---

## Detalle de los arreglos 13 a 22 (8 de agosto de 2026)

**13. Fechas de solo fecha.** `fechaSolo()` en `src/lib/fecha-local.ts` las formatea siempre en
UTC, que es como Postgres las entrega. Reemplaza el render en las 11 pantallas que leen una
columna `@db.Date` (estado de cuenta, reservas del portal y del panel, libro diario, asambleas,
evento y el documento formal). Las marcas de tiempo reales —cuándo se envió, cuándo se
registró— NO se tocaron: ahí la hora local del usuario es la correcta.
*Comprobado en vivo*: la reserva del 14 ya dice **14/8**; las cuotas de un condominio que vence
el día 15 dicen **15/5, 15/6, 15/7**; el libro diario muestra **1/9** en vez de 31/8.

**14. Facturación ordinaria.** El vencimiento se arma con `Date.UTC(...)` en vez de `setDate()`
—que trabaja en hora local— y la descripción usa `fechaSolo`. *Comprobado en vivo con el
servidor corriendo en hora de Costa Rica*: el período agosto-2026 generó
**"Cuota ordinaria agosto de 2026" con vencimiento 15/8**. Antes del arreglo, ese mismo clic
producía "julio de 2026" con vencimiento 16/7 — un cobro que nace vencido. El lote de prueba se
revirtió (cargos y asientos incluidos).

**15. Auditoría.** `AUDIT_MODULES` estaba desactualizado: faltaban seis módulos que SÍ se
registraban —Caja chica, Incumplimientos, Plataforma, Residentes, Suscripción y Visitas— y por
eso no se podían filtrar. Además, `createUserForPerson` recibe ahora quién la ejecuta y deja
asiento: **"Cuenta de condómino creada · nombre · correo"**. Dar de alta un acceso es
justamente lo que una bitácora tiene que registrar, y esa vía no dejaba rastro.

**16. Formato del monto.** `money()` separa los miles con espacio normal — "CRC 25 000,00", como
el "₡25 000,00" del resto del sistema— en vez de con punto. Se mantiene "CRC" en lugar de ₡ y
no se usa `toLocaleString`, porque ni el símbolo ni el espacio fino (U+202F) existen en WinAnsi
y el PDF se cae; este texto es el mismo que firma el documento formal, así que debe coincidir.
Las notificaciones YA emitidas conservan su texto original: un documento entregado no se
reescribe.

**17. Etiquetas de visita.** Había tres mapas distintos —panel, portal y caseta— y al del panel
le faltaban dos valores; de ahí las celdas vacías del hallazgo 3. Ahora hay uno solo en
`src/lib/etiquetas-visita.ts`, tipado como `Record<VisitType, string>`: **agregar un valor al
enum sin rotularlo ya no compila**. La bitácora de la caseta dice "Visita rápida" y "Empleado"
en vez de `rapida` y `empleado`.

**18. Permanencia.** "25924 min" pasó a **"18 d 1 h"** — minutos por debajo de una hora, horas
por debajo de un día, y días de ahí en adelante.

**19. Código muerto.** Se eliminó `src/app/seguridad/visitas/new-visit-form.tsx`, que no
importaba nadie (la caseta usa `caseta.tsx`) y que además tenía el defecto de la fecha en UTC,
listo para que alguien lo "arreglara" creyendo que estaba vivo.

**20. Basura de pruebas.** Se borraron las 2 empresas `ZZ PRUEBA FUGA RLS` y el condominio
`Condo Fuga`, que quedaron de la verificación de aislamiento del 5 de agosto. Antes se
comprobó que estaban **completamente vacías**: 0 usuarios, 0 personas, 0 propiedades, 0
cuentas contables, 0 documentos y 0 bitácora. Es solo la base LOCAL; producción no las tiene.

**21. Asignación de condominio.** `admin_owner` salió de `ROLES_ASIGNABLES`. El dueño de la
cuenta ve todos los condominios de su empresa por definición, así que asignarlo no hacía nada
—y peor, sugería que lo limitaría a ese condominio, que es lo contrario—. *Comprobado*: el
selector ahora solo ofrece supervisores y oficiales de seguridad.

**22. Teléfonos.** Validador `telefono` en `validations/comunes.ts`, aplicado a personas,
contactos de emergencia, proveedores y seguridad. Cuenta DÍGITOS, no formato: "8888-1010",
"8888 1010" y "+506 8888 1010" son válidos. Sin código de país exige los 8 dígitos exactos de
Costa Rica —que es donde está el error real— y con código de país admite hasta 15, para no
bloquear al propietario que vive fuera. *Comprobado en vivo*: escribir "87013-1071" (el número
de nueve dígitos de los datos demo) muestra **"Revisá el teléfono: en Costa Rica son 8 dígitos
(ej. 8888-1010)"** y no crea la persona.

Todo lo creado para verificar —lote de facturación, persona de prueba y su cuenta, cuotas de
mora temporales— quedó revertido; se comprobó por consulta que no queda nada.
