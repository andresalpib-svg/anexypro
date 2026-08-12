/**
 * Reautoriza la cuenta de Google Drive y deja un refresh token nuevo.
 *
 *   npx tsx scripts/autorizar-drive-oauth.ts
 *
 * POR QUÉ EXISTE. El repositorio de documentos se autentica como una
 * cuenta de Google normal (`api.anexypro@gmail.com`) con un refresh
 * token. Ese token es el único secreto que puede CADUCAR solo, sin que
 * nadie toque nada: pasó el 2026-08-12, exactamente 7 días después de
 * emitirse, y desde entonces ningún documento se podía subir. El
 * proveedor decía "volvé a autorizar la cuenta" y no había con qué —
 * este guion era una referencia en un comentario, nunca se escribió.
 *
 * EL ARREGLO DE FONDO NO ES ESTE GUION. Mientras la app OAuth siga en
 * estado «Prueba» en Google Cloud, Google vence el refresh token cada
 * 7 días y hay que volver a correr esto todas las semanas. Para que
 * deje de pasar hay que PUBLICARLA una sola vez:
 *
 *   Google Cloud → APIs y servicios → Pantalla de consentimiento OAuth
 *   → Publicar aplicación (estado: «En producción»)
 *
 * Como la app no está verificada por Google, al autorizar aparece una
 * pantalla de advertencia ("Google no ha verificado esta aplicación"):
 * hay que entrar por «Configuración avanzada → Ir a ANEXYpro». Es
 * esperable y no impide nada — el límite de una app sin verificar son
 * 100 usuarios y acá el usuario es uno solo, la propia cuenta de la
 * plataforma.
 *
 * CÓMO FUNCIONA. Flujo OAuth de bucle local, que es el que Google
 * admite para un cliente de tipo «App de escritorio»: se levanta un
 * servidor en 127.0.0.1, se abre el consentimiento en el navegador y
 * Google devuelve el código a ese servidor. El código de fuera de banda
 * (copiar y pegar) está descontinuado desde 2022 y ya no sirve.
 */
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const ENV_FILE = '.env';
const SCOPE = 'https://www.googleapis.com/auth/drive';
const PUERTO = Number(process.env.PUERTO_OAUTH ?? 53682);
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Igual que el resto de guiones: tsx no carga `.env` por su cuenta. */
function leerEnv(): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!fs.existsSync(ENV_FILE)) return vars;
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^(GOOGLE_DRIVE_[A-Z_]+)="?(.*?)"?$/);
    if (m?.[1]) vars[m[1]] = m[2] ?? '';
  }
  return vars;
}

/**
 * Reemplaza el refresh token en `.env` conservando todo lo demás tal
 * cual — comentarios incluidos. Si la variable no estaba, la agrega.
 */
function guardarEnEnv(token: string) {
  const clave = 'GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN';
  const original = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  const linea = `${clave}=${token}`;
  const yaEsta = new RegExp(`^${clave}=.*$`, 'm');
  const nuevo = yaEsta.test(original)
    ? original.replace(yaEsta, linea)
    : `${original}${original.endsWith('\n') || original === '' ? '' : '\n'}${linea}\n`;
  fs.writeFileSync(ENV_FILE, nuevo);
}

/** Espera el redirect de Google y devuelve el `code`. */
function esperarCodigo(estadoEsperado: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${PUERTO}`);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const estado = url.searchParams.get('state');

      const responder = (titulo: string, cuerpo: string) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          `<!doctype html><meta charset="utf-8"><title>${titulo}</title>` +
            `<body style="font:16px system-ui;padding:3rem;max-width:34rem;margin:auto">` +
            `<h1 style="font-size:1.25rem">${titulo}</h1><p>${cuerpo}</p></body>`
        );
      };

      // El `state` ata esta respuesta a esta ejecución: sin comprobarlo,
      // cualquier página abierta en el navegador podría llamar a este
      // puerto y colar un código ajeno.
      if (estado !== estadoEsperado) {
        responder('Respuesta inesperada', 'El parámetro <code>state</code> no coincide. Volvé a empezar.');
        server.close();
        return reject(new Error('El `state` devuelto no coincide con el enviado.'));
      }
      if (error) {
        responder('Autorización cancelada', `Google devolvió: <code>${error}</code>`);
        server.close();
        return reject(new Error(`Google devolvió "${error}".`));
      }
      if (!code) return responder('Esperando…', 'Falta el código de autorización.');

      responder('Listo', 'Ya podés cerrar esta pestaña y volver a la terminal.');
      server.close();
      resolve(code);
    });

    server.on('error', (e: any) => {
      reject(
        e?.code === 'EADDRINUSE'
          ? new Error(`El puerto ${PUERTO} está ocupado. Probá con: PUERTO_OAUTH=53683 npx tsx scripts/autorizar-drive-oauth.ts`)
          : e
      );
    });
    server.listen(PUERTO, '127.0.0.1');
  });
}

async function main() {
  const env = leerEnv();
  const clientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID ?? env.GOOGLE_DRIVE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET ?? env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      'Faltan GOOGLE_DRIVE_OAUTH_CLIENT_ID y/o GOOGLE_DRIVE_OAUTH_CLIENT_SECRET en .env.\n' +
        'Son los del cliente OAuth de tipo «App de escritorio» en Google Cloud → Credenciales.'
    );
    process.exit(1);
  }

  const redirectUri = `http://127.0.0.1:${PUERTO}`;
  const estado = crypto.randomBytes(16).toString('hex');
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    // `offline` es lo que hace que Google entregue refresh token, y
    // `consent` lo que obliga a entregar uno NUEVO: sin él, una cuenta
    // que ya autorizó antes recibe solo un access token y este guion
    // terminaría sin nada que guardar.
    access_type: 'offline',
    prompt: 'consent',
    state: estado,
  }).toString();

  console.log('\nAutorizá con la cuenta de la plataforma (api.anexypro@gmail.com), NO con una personal.');
  console.log(`Si el cliente OAuth fuera de tipo «Aplicación web», registrá esta URI de redirección: ${redirectUri}\n`);
  console.log('Abrí esta dirección en el navegador:\n');
  console.log(auth.toString());
  console.log('\nSi aparece "Google no ha verificado esta aplicación": Configuración avanzada → Ir a ANEXYpro.\n');

  // Comodidad, no requisito: si el navegador no abre solo, la URL ya
  // está impresa arriba.
  if (process.platform === 'darwin') spawn('open', [auth.toString()], { stdio: 'ignore', detached: true }).unref();

  console.log(`Esperando la respuesta de Google en ${redirectUri} …`);
  const code = await esperarCodigo(estado);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.refresh_token) {
    console.error(
      `\nGoogle no entregó un refresh token (HTTP ${res.status}).` +
        (json.error ? ` ${json.error}: ${json.error_description ?? ''}` : '')
    );
    process.exit(1);
  }

  guardarEnEnv(json.refresh_token);
  console.log('\nRefresh token nuevo guardado en .env.\n');

  // Se comprueba antes de darlo por bueno: un token que no sirve, dado
  // por bueno, es exactamente la avería que estamos arreglando.
  process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID = clientId;
  process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET = clientSecret;
  process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN = json.refresh_token;
  const { GoogleDriveProvider } = await import('../src/lib/storage/google-drive-provider');
  const salud = await new GoogleDriveProvider({
    oauthClientId: clientId,
    oauthClientSecret: clientSecret,
    oauthRefreshToken: json.refresh_token,
  }).healthCheck();
  console.log(`Comprobación: ${salud.ok ? 'OK' : 'FALLA'} — ${salud.detail}`);
  if (!salud.ok) process.exit(1);

  console.log('\n--- FALTA UN PASO: producción lee el token del entorno de Vercel, no de .env ---\n');
  console.log('  vercel env rm GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN production');
  console.log('  vercel env add GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN production');
  console.log('\ny pegá este valor:\n');
  console.log(json.refresh_token);
  console.log('\nDespués, un despliegue nuevo (`vercel --prod`) para que la función lo tome.');
  console.log('\nPara no repetir esto cada 7 días, publicá la app OAuth: Google Cloud →');
  console.log('Pantalla de consentimiento OAuth → Publicar aplicación («En producción»).\n');
}

main().catch((e) => {
  console.error('FALLA:', e.message);
  process.exit(1);
});
