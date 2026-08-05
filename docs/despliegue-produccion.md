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

**La base de producción se creó sin migraciones**, con `db push` desde
una versión vieja del modelo: le faltaban 33 tablas. `desplegar-bd.ts`
lo detecta, la pone al día y normaliza el historial. `db push` corre
**sin `--accept-data-loss`**: si un cambio exigiera borrar datos, falla
en vez de destruirlos.

## Pendientes que no son de código

1. **DNS**: `app.anexypro.com` no resuelve. En Hostinger hay un registro
   A "app" → 2.57.91.91 que impide crear el CNAME a Vercel. Hoy
   responden `anexypro.vercel.app` y `api.anexypro.com`.
2. **Google Drive**: faltan en Vercel `GOOGLE_DRIVE_OAUTH_CLIENT_ID`,
   `..._SECRET` y `..._REFRESH_TOKEN`, y dejar
   `StorageSettings.provider='google_drive'` en la base de producción.
   Mientras tanto el repositorio usa almacenamiento local, que en
   serverless **no persiste entre despliegues**.
3. **Contraseña del administrador inicial** y limpieza de cuentas de
   prueba.
4. **Decidir qué datos se conservan** en producción.
