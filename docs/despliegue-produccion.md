# Despliegue a producción — ANEXYpro

Estado al 5 de agosto de 2026.

## Cómo se despliega

**No hay integración de GitHub que dispare builds**: `git push` publica
el código pero **no despliega**. El despliegue se lanza a mano:

```bash
npx vercel --prod --yes
```

El build corre `npm run vercel-build`:

```
prisma generate  →  tsx scripts/desplegar-bd.ts  →  next build
```

y `desplegar-bd.ts` hace reconciliar → migrar → SQL → verificar. **Si la
verificación falla, el despliegue se detiene** y la versión anterior
sigue sirviendo. Es deliberado: mejor no publicar que publicar algo que
cobra mal o que no puede consultar la base.

## Lo único que falta para que producción funcione

`DATABASE_URL` está mal formada para el pooler de Supabase. Su usuario
es `anexypro_app` a secas, y Supavisor exige que sea:

```
anexypro_app.<referencia-del-proyecto>
```

La referencia es el `<ref>` del host de `DIRECT_URL`
(`db.<ref>.supabase.co`). Sin ese sufijo, **toda** consulta falla con:

```
FATAL: (ENOIDENTIFIER) no tenant identifier provided
```

El efecto es engañoso: las pantallas cargan, pero nadie puede iniciar
sesión, porque la aplicación no puede leer la tabla de usuarios.

Se corrige en **Vercel → Settings → Environment Variables →
DATABASE_URL**, cambiando solo el usuario y dejando igual la contraseña,
el host y la base. Después:

```bash
npx vercel --prod --yes
```

Para comprobarlo sin desplegar, con las variables de producción:

```bash
npm run db:verify
```

## Trampas ya resueltas (no repetir)

**El campo `env` de `vercel.json` NO documenta variables: las define.**
Estaba lleno de descripciones ("URL de producción para NextAuth",
"PostgreSQL connection string…") y Vercel las inyectaba como valores,
pisando las del proyecto. El build funcionaba —usa las variables
reales— y la ejecución devolvía **500 en todas las rutas**, porque
`new URL('URL de producción para NextAuth')` revienta. El bloque se
eliminó; las variables se configuran en el panel y se documentan en
`.env.example`.

**El middleware no puede importar `@/lib/auth`.** Arrastra Prisma, que
no funciona en Edge Runtime. Por eso existe `src/lib/auth.config.ts`
—configuración sin base de datos— que es la que usa el middleware.

**El middleware falla de forma segura.** Si no puede resolver la sesión,
registra el motivo y manda al acceso. Antes propagaba la excepción y
Vercel devolvía 500 en todas las rutas, incluida `/login`: la
aplicación quedaba sin forma de entrar a arreglarla.

**El middleware se estaba comiendo el cron (2026-08-12).** `vercel.json`
tenía su `crons` y `CRON_SECRET` estaba cargado en Vercel, pero el
programador **nunca había corrido ni una vez**. El motivo: el matcher del
middleware incluye `/api/cron`, y como esa ruta se autoriza con la
cabecera `Authorization: Bearer <CRON_SECRET>` y no con cookie de sesión,
el portero la mandaba a `/login` con un **307**. Vercel disparaba el cron
todos los días a las 14:00 UTC, recibía un redirect perfectamente válido,
lo daba por bueno — y el manejador de la ruta no llegaba a ejecutarse
jamás. Ningún proceso automático corría (intereses moratorios,
facturación de la cuota, gastos recurrentes, avisos de contratos,
cobranza, informe mensual, revisión del sistema) y **no había error en
ningún lado**: la bitácora vacía se ve igual que un cron todavía sin
programar. Ahora `seAutorizaSola('/api/cron')` la deja pasar; la
autorización real (secreto en tiempo constante o sesión
master/admin_owner) sigue estando dentro de la ruta, que responde 401 por
su cuenta — que además es lo correcto para una API. Comprobación rápida
sobre cualquier despliegue:

```
curl -s -o /dev/null -w "%{http_code}\n" https://api.anexypro.com/api/cron
```

**401 es lo correcto** (la ruta contestó). **307 significa que el cron
está muerto otra vez.**

**La base de producción se creó sin migraciones**, con `db push` desde
una versión vieja del modelo: le faltaban 33 tablas. `desplegar-bd.ts`
lo detecta, la pone al día y normaliza el historial. `db push` corre
**sin `--accept-data-loss`**: si un cambio exigiera borrar datos, falla
en vez de destruirlos.

## Pendientes que no son de código

1. **El dominio bueno es `api.anexypro.com`** (CNAME a
   `anexypro.vercel.app`, comprobado el 6/8: responde 200 y lo sirve
   Vercel). `app.anexypro.com` es un resto: apunta a 2.57.91.91 de
   Hostinger y no responde. **Falta corregir en Vercel `APP_URL` y
   `NEXTAUTH_URL`, que siguen apuntando a `app.`** — y `APP_URL` es la
   dirección que viaja dentro de los correos de bienvenida y de
   recuperación, así que hoy le mandaría a cada residente un enlace
   muerto. En el código ya quedó `api.` (`.env`, `.env.example` y el
   valor por omisión de `email.ts`), y el Estado del Sistema lo
   comprueba en cada revisión.
2. **Google Drive**: las tres variables OAuth ya están cargadas en
   Vercel (comprobado el 6/8). Queda confirmar que en la base de
   producción `StorageSettings.provider` sea `google_drive`; si sigue en
   `local`, el repositorio usa almacenamiento de disco, que en
   serverless **no persiste entre despliegues**. Se ve de un vistazo en
   Estado del Sistema.
3. **Contraseña del administrador inicial** y limpieza de cuentas de
   prueba.
4. **Decidir qué datos se conservan** en producción.
