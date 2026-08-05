# Suscripciones

El sistema se usa por suscripción. Cada empresa administradora contrata
un plan con su precio, su periodicidad y su tope de condominios; si se
atrasa, el master puede bloquearle el acceso.

**Bloquear no borra nada.** El bloqueo cierra el paso a algunos roles;
residentes, finanzas, documentos y expedientes quedan intactos y vuelven
a estar disponibles en cuanto se registra el pago. Las tres pantallas de
bloqueo lo dicen explícitamente, porque es la primera pregunta de quien
se encuentra la puerta cerrada.

---

## Planes

`/master/suscripciones`. Cada plan define:

| Campo | Para qué |
| --- | --- |
| Precio y moneda | Lo que se cobra |
| Periodicidad | Mensual, trimestral, semestral o anual — determina cuánto corre la fecha al pagar |
| Condominios permitidos | `0` = sin tope |
| Plazo de pago | **Días hábiles** de gracia antes de que corresponda bloquear (5 por omisión) |

Un plan que ya tienen empresas no se puede borrar: se desactiva.

`prisma/seed-plans.ts` deja cuatro de partida. Los precios los define el
negocio desde la pantalla, no el código.

---

## El estado de la cuenta no se guarda

`src/lib/domain/subscription.ts` — función pura, 16 pruebas. Recibe la
fecha del próximo pago y los días de gracia, devuelve el estado y qué
corresponde hacer.

Se **deriva**, no se persiste, igual que los saldos del condominio: un
estado guardado en una columna se desincroniza en cuanto pasa un día sin
que nadie abra la pantalla, y entonces el sistema cree que una empresa
está al día cuando no lo está.

| Estado | Cuándo | Qué toca |
| --- | --- | --- |
| Sin plan | No tiene suscripción asignada | Avisar |
| Al día | Falta más de una semana | Nada |
| Por vencer | Faltan 7 días o menos | Avisar |
| Pago pendiente | Venció, dentro del plazo hábil | Avisar |
| Corresponde bloquear | Se agotó el plazo | Decidir el bloqueo |
| Bloqueada | El master cortó el acceso | Desbloquear al pagar |

### El plazo son días hábiles, y el último día cuenta entero

Cinco días naturales que caigan en un fin de semana dejarían al cliente
sin margen real para pagar. Si vence un viernes, el plazo llega al
viernes siguiente, no al miércoles.

Y el plazo vence al **final** del último día hábil, no a su medianoche:
si llega al día 5, el cliente tiene el día 5 completo.

**Todo el cálculo va en UTC.** Las fechas son `@db.Date` y Prisma las
entrega como medianoche UTC; con `getDay()` —que es hora local— en Costa
Rica (UTC-6) esa medianoche cae el día anterior a las seis de la tarde, y
un sábado se contaría como viernes hábil. Ese error apareció en las
pruebas antes de llegar a ninguna pantalla.

---

## El bloqueo lo decide el master

El sistema **avisa**; el master **confirma**. Cortarle el acceso a un
cliente que quizás pagó ayer por transferencia sin avisar es difícil de
deshacer, y siempre hay casos que ameritan esperar.

En `/master/suscripciones`, arriba de todo, aparece qué hay que atender
hoy ordenado por urgencia: primero a quién corresponde bloquear, luego
quién está dentro del plazo, luego quién no tiene plan. Si no hay nada,
lo dice.

Estar en mora **no** bloquea por sí solo: solo el bloqueo explícito corta
el acceso.

---

## Qué pasa con la empresa bloqueada

| Rol | Qué puede |
| --- | --- |
| **Administrador** | Entra, pero solo ve la pantalla de suscripción vencida, con el motivo y a quién contactar |
| **Supervisor y contador** | No ingresan: ven el aviso de acceso suspendido |
| **Residente** | Consulta su información —estado de cuenta, comunicados, documentos— pero **no autoriza visitas ni reserva áreas** |
| **Caseta de seguridad** | **Sigue operando con normalidad** |

La caseta se dejó fuera del bloqueo por decisión propia, señalada al
implementarlo: cortar el control de acceso físico de un condominio por
una factura impaga pondría en riesgo a residentes que no son parte del
problema comercial. Si se prefiere lo contrario, es un cambio de una
línea en el layout de `/seguridad`.

El corte de las funciones del residente se comprueba **en el servidor**,
no ocultando el botón: esconder un formulario no impide enviarlo.

---

## Registrar un pago

Registra el importe, corre la fecha del próximo período según la
periodicidad del plan y **desbloquea la empresa si estaba bloqueada** —
pagar es exactamente la condición que la dejó fuera, y hacerlo en dos
pasos solo generaría llamadas de clientes que pagaron y siguen sin poder
entrar.

Queda el historial de pagos con medio, referencia y quién lo registró.

---

## Tope de condominios

Se comprueba **antes** de crear: pasarse y descubrirlo después obligaría
a borrar un condominio recién dado de alta con sus unidades dentro.

Si una empresa ya tiene más condominios de los que permite un plan al que
se la cambia, los existentes se conservan y no podrá crear más hasta
ampliarlo. La pantalla lo advierte al asignar el plan.

---

## Verificación

`.demo-tools/audit-suscripciones.mjs`, contra la aplicación real:

| Comprobación | Resultado |
| --- | --- |
| Con el plazo agotado avisa que corresponde bloquear | ✓ |
| El modal advierte que no se elimina información | ✓ |
| La empresa queda bloqueada | ✓ |
| El administrador ve la pantalla de pago | ✓ |
| El supervisor ve el aviso de suspensión | ✓ |
| A ambos se les informa que la información está intacta | ✓ |
| El residente sigue consultando su estado de cuenta | ✓ |
| La caseta sigue operando | ✓ |
| El pago corre la fecha y desbloquea | ✓ |
| Tras el pago vuelve el acceso con los datos intactos | ✓ |

---

## Lo que queda para más adelante

- **Aviso por correo** a la empresa antes del vencimiento. Hoy el aviso
  es para el master, dentro del sistema; en cuanto haya correo saliente
  configurado se puede avisar también al cliente.
- **Cobro en línea.** Hoy el pago se registra a mano cuando entra.
- **Facturación de la suscripción.** El historial guarda el pago, no
  emite comprobante tributario.
