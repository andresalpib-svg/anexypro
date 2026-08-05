# Procedimiento de base de datos — ANEXYpro

Prisma gestiona las **tablas** (`schema.prisma`). Las **vistas, funciones,
triggers y políticas de Row-Level Security** viven aparte, en
`prisma/sql/`, porque Prisma no las modela de forma nativa con la
fidelidad que el diseño requiere (ver la cabecera de `schema.prisma`).

Eso hace que la base **no quede completa solo con `prisma migrate`**.
Falta el SQL, y sin él la aplicación arranca igual pero se comporta
mal: se puede reservar la misma amenidad dos veces a la misma hora y
los cargos nunca pasan a «pagado», así que la morosidad de los
reportes sale inflada.

## Un solo comando

```bash
npm run db:sql
```

`scripts/desplegar-bd.ts` hace los tres pasos en orden:

1. `prisma migrate deploy` — las tablas.
2. Todos los `prisma/sql/*.sql`, en orden numérico.
3. `scripts/verificar-bd.ts` — comprueba el resultado y **sale con
   error si algo falta**.

Los cinco archivos SQL son **idempotentes**: se reaplican en cada
despliegue a propósito, para que un cambio en una política viaje con el
código que lo necesita.

## En el despliegue

`vercel.json` usa `npm run vercel-build`, que es:

```
prisma generate && tsx scripts/desplegar-bd.ts && next build
```

Si la verificación falla, **el despliegue se detiene** y no se publica
una versión que cobraría mal. Es deliberado: un fallo ruidoso es mejor
que una base incompleta en producción.

## Solo verificar

```bash
npm run db:verify
```

Útil contra producción después de desplegar. Comprueba diez cosas,
entre ellas la restricción de reservas solapadas, el trigger de estado
de cargos, que RLS esté **forzado** en todas las tablas con política, y
que el rol de la aplicación no sea superusuario (si lo fuera, las
políticas no se aplicarían nunca y el aislamiento entre empresas sería
decorativo).

## Primera vez, base vacía

```bash
npm install
npm run db:generate
npm run db:sql          # migraciones + SQL + verificación
npm run db:seed
```

Antes de eso hay que crear el rol de la aplicación con
`scripts/crear-rol-app.sql` y poner ese rol en `DATABASE_URL`, dejando
el dueño en `DIRECT_URL`. Están los dos porque el `datasource` de
Prisma los usa para cosas distintas: la aplicación se conecta con el
rol restringido, y las migraciones necesitan al dueño.

## Cuando cambie el esquema

```bash
npx prisma migrate dev --name descripcion_del_cambio
```

Si el cambio afecta a una vista, un trigger o una política, editá el
archivo de `prisma/sql/` correspondiente. No hace falta aplicarlo a
mano: el siguiente `npm run db:sql` (y el despliegue) lo reaplica.

## Programador de tareas

`vercel.json` incluye la llamada diaria a `/api/cron`. **Vercel programa
en UTC**: `0 14 * * *` son las 8:00 de la mañana en Costa Rica (UTC−6).

Depende de la variable `CRON_SECRET`. Vercel envía el encabezado
`Authorization: Bearer $CRON_SECRET` automáticamente cuando esa
variable existe, y el endpoint la exige. **Si no está definida, el
acceso por encabezado queda deshabilitado y ningún proceso automático
corre** — intereses moratorios, facturación de la cuota, gastos
recurrentes, alertas de contratos, cobranza e informe mensual. El
sistema se ve funcionando sin estarlo. Generarla con:

```bash
openssl rand -hex 32
```

Nota de plataforma: `/api/cron` declara `maxDuration = 300`. El plan
Hobby de Vercel corta a los 60 segundos; hace falta plan Pro para que
una corrida larga termine.

## Nota sobre las vistas y la capa de aplicación

Cada vista SQL tiene su equivalente en `src/lib/services/*.ts` — por
ejemplo, `v_property_suspension` se replica en
`src/lib/services/finance.ts` → `isPropertySuspended()`. Es
intencional: la aplicación no depende exclusivamente de que las vistas
existan (más fácil de probar, más portable), pero las vistas sí existen
para consultas directas, reportes ad hoc y herramientas de BI externas.
