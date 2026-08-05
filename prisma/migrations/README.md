# Procedimiento de migración — ANEXYpro

Prisma gestiona las **tablas** (`schema.prisma`). Las **vistas, funciones,
triggers y políticas de Row-Level Security** viven aparte, en
`prisma/sql/`, porque Prisma no las modela de forma nativa con la
fidelidad que el diseño original requiere (ver la cabecera de
`schema.prisma` para el porqué).

## Primera vez (base de datos vacía)

```bash
# 1) Instalar dependencias
npm install

# 2) Generar el cliente de Prisma
npm run db:generate

# 3) Crear la base de datos y las tablas a partir del schema
npx prisma migrate dev --name init

# 4) Aplicar el SQL complementario, EN ESTE ORDEN
psql "$DATABASE_URL" -f prisma/sql/01_views_functions_triggers.sql
psql "$DATABASE_URL" -f prisma/sql/02_row_level_security.sql
```

El paso 3 crea las tablas. El paso 4 agrega todo lo que Prisma no
puede expresar: las vistas derivadas (`v_property_balance`,
`v_libro_mayor`, `v_assembly_vote_results`, etc.), los triggers de
integridad (partida doble balanceada, sincronización de estado de
cargos, placa única, comprobante obligatorio en reservas con costo) y
las políticas de aislamiento multi-tenant.

## Cuando cambie el schema

```bash
npx prisma migrate dev --name descripcion_del_cambio
```

Si el cambio afecta una vista o función de `prisma/sql/` (por ejemplo,
agregar una cuenta contable nueva que la vista de resultados debería
excluir), edita el archivo SQL correspondiente y vuelve a aplicarlo
con `psql` — Prisma no lo hace por vos automáticamente.

## Verificación

```bash
npx prisma studio        # explorar los datos con una UI
npx prisma validate      # validar que el schema es correcto
```

## Nota sobre las vistas y la capa de aplicación

Cada vista SQL tiene su equivalente en `src/lib/services/*.ts` — por
ejemplo, `v_property_suspension` se replica en
`src/lib/services/finance.ts` → `isPropertySuspended()`. Esto es
intencional: la aplicación NO depende exclusivamente de que las vistas
existan en la base de datos (más fácil de testear, más portable), pero
las vistas SÍ existen para consultas directas, reportes ad hoc y
herramientas de BI externas que se conecten a la misma base.
