# Gestión de Incumplimientos

Notificar un incumplimiento del reglamento tenía que costar menos de
medio minuto y tres pasos. Todo lo demás —qué corresponde emitir, con
qué texto, a quién se le manda, si genera multa— lo resuelve el sistema
con lo que la administración configuró.

---

## Los tres pasos

**1. Filial.** Un solo campo de búsqueda que entiende número de filial,
nombre del propietario, número de casa y torre. Obligar a elegir "por
cuál campo busco" es justo la fricción que este módulo existe para
quitar. Al seleccionarla aparecen el propietario, su correo, el
condominio y el historial: expedientes, advertencias previas y multas.

**2. Tipo de incumplimiento.** Botones grandes, uno por tipo del
catálogo. No hay más que tocar uno. El sistema revisa el historial de
esa filial y avisa qué corresponde **antes** de confirmar:

> Esta filial ya recibió una advertencia por este incumplimiento.
> Corresponde emitir la 2.ª notificación.

**3. Evidencia.** Cámara o galería, varias fotos, video opcional y una
observación corta si hace falta. Un botón: **Enviar notificación**.

No hay edición del documento en ningún punto. El usuario nunca ve una
plantilla ni un editor de texto.

---

## Qué pasa al enviar

En orden, y el orden importa:

1. El motor decide la acción según la configuración y el historial.
2. Se resuelve la plantilla sustituyendo las variables.
3. **Se escribe el expediente y la acción, en una transacción.**
4. Si es multa, se crea la cuenta por cobrar en el módulo financiero.
5. Se genera el PDF con las fotografías incrustadas y se guarda en el
   repositorio del condominio.
6. Se envía el correo.

El correo va **al final** a propósito. Si falla, la notificación ya
existe y queda registrado que no salió; al revés se perdería la
constancia de una gestión que sí se hizo. Lo mismo con el PDF y con el
cobro: si alguno falla, el expediente queda con la nota del error en vez
de perderse la gestión completa.

**Si no hay correo saliente configurado** —hoy `RESEND_API_KEY` no está
puesta— la notificación se emite igual y la pantalla lo dice sin
disimulo: "El correo no salió: falta configurar el correo saliente".

---

## El motor de escalamiento

`src/lib/domain/violations.ts`. Función pura: recibe la configuración
del tipo y el estado del expediente, devuelve qué corresponde. No
consulta la base ni escribe nada, así que se prueba entera (16 pruebas)
y la pantalla puede mostrar por adelantado lo que va a pasar.

**No hay reglas fijas en el código.** Cada tipo define su propio flujo:

| Configuración | Resultado |
| --- | --- |
| Ruido: 2 advertencias, cada 15 días | 1.ª → 2.ª → multa |
| Construcción: 1 advertencia, cada 10 días | 1.ª → multa |
| Daño a áreas comunes: multa inmediata | multa desde la primera vez |

La multa cierra el expediente. Si el plazo entre acciones todavía no se
cumple, la pantalla lo advierte pero **deja emitir**: quien está parado
frente al problema sabe si amerita.

Qué se emite lo decide el servidor con el historial, no el formulario.
Manipular el cliente no cambia el resultado.

---

## Configuración

`/app/incumplimientos/configuracion`, solo para el administrador
principal. El editor de cada tipo tiene tres secciones:

1. **Plazos de reincidencia y aplicación de multa** — advertencias antes
   de la multa, días entre una acción y la siguiente, y multa inmediata
   sí/no.
2. **Monto de la multa** para ese incumplimiento. Al emitirla, ese monto
   se carga al estado de cuenta de la filial como cuenta por cobrar.
3. **Formato de los tres documentos** — primera notificación, segunda en
   adelante, y resolución de multa, cada uno editable por separado.

La segunda notificación tiene formato propio porque tiene que decir algo
que la primera no puede: cuándo se envió la anterior. Usa
`{fechaPrimera}`, `{horaPrimera}` y `{consecuencia}`. Si se deja vacía se
usa el texto estándar —no el de la primera—, porque repetir el mismo
texto no advierte de nada.

`{consecuencia}` la arma el sistema con el escalamiento configurado, así
que dice el monto y las etapas reales de ese tipo. También aparece en la
primera notificación: una advertencia que no dice qué pasa si se
reincide no sirve como antecedente si el caso escala.

Un tipo con expedientes no se puede borrar —perdería el historial—;
se desactiva y deja de aparecer en los botones.

El **formato del documento** (membrete, logo, color, firma, plazo de
respuesta) es del condominio, no del tipo: la notificación por ruido y
la de parqueo salen con la misma firma.

`prisma/seed-violations.ts` deja los diez tipos iniciales para que el
módulo no arranque vacío. Es idempotente.

---

## El documento

`src/lib/pdf/violation-notice.ts`, con pdf-lib. Membrete, datos del
caso, cuerpo, monto si es multa, observación, las fotografías en
cuadrícula, plazo y firma.

Dos límites de pdf-lib que están resueltos y conviene no olvidar:

- **Con fuentes estándar solo escribe WinAnsi.** Los acentos y la eñe
  entran; el símbolo **₡ revienta la generación**. Los montos se rotulan
  `CRC 25.000,00`, y cualquier carácter fuera de esa tabla que llegue en
  un nombre o una observación se sustituye antes de dibujar.
- **`embedPng` entra en bucle infinito con un PNG corrupto** — no lanza,
  se come la CPU y cuelga el proceso. Toda imagen pasa antes por
  `isSafePng`/`isSafeJpeg`.

El formato del monto se arma a mano y no con `toLocaleString`, que según
la versión de Node separa los miles con un espacio fino que WinAnsi no
tiene: el monto de una resolución de multa no puede depender de dónde
corra el servidor.

---

## Expediente digital

Todo el caso en un solo lugar: cada notificación emitida, sus
fotografías, quién la emitió, si el correo salió, el monto, el cobro
generado y **cuándo la leyó el residente**.

Cerrar un expediente exige motivo y queda en la bitácora de auditoría.

---

## Portal del residente

Aviso visible en su pantalla principal cuando tiene notificaciones sin
leer. En `/portal/incumplimientos` lee el texto completo, ve las
fotografías, descarga el PDF y **confirma la lectura**. Se registra
fecha y hora, y la administración lo ve en el expediente.

La filial sale de la sesión, no del cliente: nadie puede confirmar la
lectura de una notificación de otra unidad, y el servicio conserva la
primera fecha, que es la que vale como constancia.

---

## Seguimiento automático

El trabajo `seguimiento-incumplimientos` (diario, dentro de `/api/cron`)
crea una tarea para el administrador cuando un expediente abierto está a
dos días de poder escalar. Aparece en el panel y en la campana, con el
enlace y la indicación de qué corresponde.

Es idempotente por expediente: si ya hay una tarea viva no crea otra.
Repetir el aviso a diario convertiría la bandeja en ruido.

**Depende de que la llamada diaria a `/api/cron` esté programada** —
sigue pendiente, igual que para el resto de procesos automáticos.

---

## Reportes e indicadores

Pestaña **Gestión de Incumplimientos** en Reportes, con filtros por
fecha, estado, solo con multa y solo reincidencias, y descarga a Excel.
Incluye incumplimientos del mes, casos abiertos, próximos a vencer,
multas aplicadas, tiempo promedio de resolución, filiales con más
incumplimientos y tipos más frecuentes.

Los mismos indicadores, resumidos, en el panel del administrador.

---

## Permisos y aislamiento

Área propia `incumplimientos`, que el administrador otorga o quita a
cada supervisor. **No se expone a la Junta Directiva** —los expedientes
llevan datos personales de vecinos y fotografías— ni al contador.

Las cinco tablas entran al aislamiento por Row-Level Security con
`FORCE`, igual que el resto (`prisma/sql/05_rls_incumplimientos.sql`).
Comprobado: desde el contexto de una empresa no se pueden leer ni
modificar los tipos de otra.

Las evidencias y los PDF van al **repositorio privado** del condominio,
no a una carpeta pública: se sirven por `/api/archivo/<id>`, que exige
sesión y revalida permisos en cada descarga.

---

## Verificación

`.demo-tools/audit-incumplimientos.mjs` y `audit-residente.mjs`, contra
la aplicación real:

| Comprobación | Resultado |
| --- | --- |
| 1.ª advertencia emitida con evidencia | ✓ |
| PDF generado y guardado en el repositorio | ✓ |
| Aviso de reincidencia antes de confirmar | ✓ |
| Escala a la 2.ª advertencia | ✓ |
| Agotadas las advertencias, aplica la multa | ✓ |
| Genera la cuenta por cobrar en Finanzas | ✓ |
| Multa inmediata sin advertencias previas | ✓ |
| El expediente muestra evidencia y acuse | ✓ |
| El residente ve el aviso en su panel | ✓ |
| Lee, descarga el PDF y confirma la lectura | ✓ |
| La administración ve la fecha de lectura | ✓ |
| Aislamiento entre empresas | bloqueado |

27 pruebas unitarias nuevas (motor de escalamiento y generación del PDF).

---

## Lo que queda para más adelante

- **Firma electrónica** del documento: el PDF ya se genera en un solo
  punto, así que es donde habría que engancharla.
- **Notificación push** al residente: hoy es correo más aviso en el
  portal.
- **Descarga del reporte en PDF**: hoy la exportación es a Excel.
- **Escalamiento con más etapas** (por ejemplo, multas crecientes): el
  motor está preparado para recibir más reglas sin cambiar quien lo
  llama.
