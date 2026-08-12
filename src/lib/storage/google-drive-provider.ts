import crypto from 'node:crypto';
import type { FileRef, FolderChildren, FolderRef, OwnershipInfo, SearchInput, StorageProvider, UploadInput } from './provider';

/**
 * Proveedor de Google Drive.
 *
 * TODA la lógica de Drive vive acá y en ningún otro archivo del
 * sistema. Si mañana se reemplaza por S3, este archivo se deja de usar
 * y nada más cambia.
 *
 * Se habla con la API REST v3 directamente en vez de usar el SDK
 * `googleapis`. Razones:
 *  - Son cuatro llamadas HTTP; el SDK son decenas de megabytes y
 *    arrastra dependencias que después hay que mantener.
 *  - La autenticación de cuenta de servicio es un JWT firmado con
 *    RS256, que Node hace de forma nativa con `crypto`.
 *  - Menos superficie que auditar en un componente que maneja
 *    documentos privados de condóminos.
 *
 * Requiere una CUENTA DE SERVICIO de Google Cloud con la API de Drive
 * habilitada, y que la carpeta raíz esté compartida con el correo de
 * esa cuenta de servicio.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export type GoogleDriveConfig = {
  /** Correo de la cuenta de servicio (modo cuenta de servicio). */
  clientEmail?: string;
  /** Llave privada en PEM. Se guarda cifrada en la configuración. */
  privateKey?: string;
  /**
   * Unidad compartida, si se usa una. OJO: desde 2025 Google exige
   * unidad compartida (Workspace) para que una cuenta de servicio pueda
   * SUBIR archivos — las cuentas de servicio ya no tienen cuota propia.
   */
  driveId?: string;
  /**
   * Modo OAuth de usuario: los archivos viven en el Drive de una cuenta
   * de Google normal (15 GB gratuitos) y le pertenecen a ella. Es la vía
   * soportada por Google para Drive personal sin Workspace. El refresh
   * token se obtiene una única vez con `scripts/autorizar-drive-oauth.ts`.
   */
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthRefreshToken?: string;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Escapa un valor para la sintaxis de consulta de Drive. */
function q(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Traduce el rechazo del endpoint de token de Google a algo accionable.
 *
 * Es lo que termina leyendo el administrador en «Estado del sistema»,
 * así que cada caso lleva el paso siguiente, no el diagnóstico a secas.
 * `invalid_grant` es el que de verdad ocurre: mientras la app OAuth
 * siga en estado «Prueba» en Google Cloud, Google vence el refresh
 * token a los 7 días — pasó el 2026-08-12 y dejó el repositorio sin
 * poder guardar nada.
 */
export function motivoDelRechazo(status: number, codigo: string): string {
  const base = `Google Drive rechazó el token de actualización (${status}${codigo ? ` ${codigo}` : ''}).`;
  if (codigo === 'invalid_grant') {
    return (
      `${base} El token venció o fue revocado. Reautorizá con ` +
      '`npx tsx scripts/autorizar-drive-oauth.ts` y actualizá GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN en Vercel. ' +
      'Si vuelve a pasar a los pocos días, es que la app OAuth sigue en modo «Prueba»: publicala en Google Cloud → Pantalla de consentimiento.'
    );
  }
  if (codigo === 'invalid_client' || codigo === 'unauthorized_client') {
    return (
      `${base} No es el token: son las credenciales del cliente OAuth. ` +
      'GOOGLE_DRIVE_OAUTH_CLIENT_ID / _CLIENT_SECRET no corresponden al cliente que emitió el token — revisalos en Google Cloud → Credenciales.'
    );
  }
  return `${base} Volvé a autorizar la cuenta con \`npx tsx scripts/autorizar-drive-oauth.ts\`.`;
}

export class GoogleDriveProvider implements StorageProvider {
  readonly kind = 'google_drive' as const;

  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: GoogleDriveConfig) {}

  /**
   * Token de acceso. Se reutiliza hasta un minuto antes de vencer para
   * no pedir uno por cada llamada. Dos modos: OAuth de usuario (refresh
   * token) o cuenta de servicio (JWT RS256).
   */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;

    if (this.config.oauthRefreshToken) {
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.config.oauthClientId ?? '',
          client_secret: this.config.oauthClientSecret ?? '',
          refresh_token: this.config.oauthRefreshToken,
        }),
      });
      if (!res.ok) {
        // El cuerpo de Google trae el motivo exacto y cada motivo tiene
        // un arreglo DISTINTO. Sin él, el mensaje era siempre "volvé a
        // autorizar la cuenta" — que para `invalid_client` (credenciales
        // del cliente cambiadas) es el consejo equivocado y hace perder
        // la tarde.
        const cuerpo = await res.text().catch(() => '');
        let codigo = '';
        try {
          codigo = (JSON.parse(cuerpo) as { error?: string }).error ?? '';
        } catch {
          /* Google devolvió algo que no es JSON: queda el status a secas. */
        }
        throw new Error(motivoDelRechazo(res.status, codigo));
      }
      const json = (await res.json()) as { access_token: string; expires_in: number };
      this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
      return this.token.value;
    }

    if (!this.config.clientEmail || !this.config.privateKey) {
      throw new Error('Google Drive no tiene credenciales: faltan las de OAuth o las de la cuenta de servicio.');
    }

    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({
        iss: this.config.clientEmail,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      })
    );
    const signature = base64url(
      crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(this.config.privateKey.replace(/\\n/g, '\n'))
    );

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`,
      }),
    });
    if (!res.ok) {
      throw new Error(`Google Drive rechazó las credenciales (${res.status}). Revisá la cuenta de servicio.`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return this.token.value;
  }

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.accessToken();
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Google Drive respondió ${res.status}: ${body.slice(0, 300)}`);
    }
    return res;
  }

  /**
   * Como `call`, pero sin lanzar por un 404 — lo necesitan las
   * operaciones de PASO 9 (inspeccionar/borrar de forma permanente),
   * donde "ya no existe" es un resultado válido e IDEMPOTENTE, no un
   * error a propagar.
   */
  private async callTolerantOf404(url: string, init: RequestInit = {}): Promise<Response | null> {
    const token = await this.accessToken();
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Google Drive respondió ${res.status}: ${body.slice(0, 300)}`);
    }
    return res;
  }

  /** Parámetros comunes para que funcione igual en unidades compartidas. */
  private shared(params: URLSearchParams): URLSearchParams {
    params.set('supportsAllDrives', 'true');
    params.set('includeItemsFromAllDrives', 'true');
    if (this.config.driveId) {
      params.set('driveId', this.config.driveId);
      params.set('corpora', 'drive');
    }
    return params;
  }

  async createFolder(name: string, parentId?: string): Promise<FolderRef> {
    // Idempotente: si ya existe una carpeta con ese nombre en el mismo
    // padre, se devuelve. Reconstruir el árbol de un condominio no
    // debe duplicar carpetas.
    const filters = [
      `mimeType='${FOLDER_MIME}'`,
      `name='${q(name)}'`,
      'trashed=false',
      parentId ? `'${q(parentId)}' in parents` : null,
    ]
      .filter(Boolean)
      .join(' and ');

    const search = this.shared(new URLSearchParams({ q: filters, fields: 'files(id,name)', pageSize: '1' }));
    const found = (await (await this.call(`${API}/files?${search}`)).json()) as { files?: { id: string; name: string }[] };
    if (found.files?.length) return { id: found.files[0]!.id, name: found.files[0]!.name };

    const params = this.shared(new URLSearchParams({ fields: 'id,name' }));
    const res = await this.call(`${API}/files?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    });
    const json = (await res.json()) as { id: string; name: string };
    return { id: json.id, name: json.name };
  }

  async uploadFile(input: UploadInput): Promise<FileRef> {
    // Subida multipart: metadatos y bytes en una sola llamada.
    const boundary = `anexypro-${crypto.randomUUID()}`;
    const metadata = JSON.stringify({ name: input.name, parents: [input.parentId] });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`),
      input.data,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const params = this.shared(new URLSearchParams({ uploadType: 'multipart', fields: 'id,name,mimeType,size,modifiedTime' }));
    const res = await this.call(`${UPLOAD_API}/files?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    const json = (await res.json()) as { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string };
    return {
      id: json.id,
      name: json.name,
      mimeType: json.mimeType,
      sizeBytes: Number(json.size ?? input.data.length),
      modifiedAt: json.modifiedTime ? new Date(json.modifiedTime) : null,
    };
  }

  async downloadFile(id: string): Promise<Buffer> {
    const params = this.shared(new URLSearchParams({ alt: 'media' }));
    const res = await this.call(`${API}/files/${encodeURIComponent(id)}?${params}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async deleteFile(id: string): Promise<void> {
    // A la papelera, no borrado definitivo: un borrado accidental de un
    // acta o un contrato debe poder recuperarse.
    const params = this.shared(new URLSearchParams());
    await this.call(`${API}/files/${encodeURIComponent(id)}?${params}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    });
  }

  /**
   * Hijos directos de una carpeta, carpetas y archivos separados —
   * pagina hasta agotar `nextPageToken` para no dejar nada afuera
   * (a diferencia de `listFolder`, que se queda con las primeras 200
   * filas porque es para mostrar contenido, no para verificar que una
   * carpeta quedó realmente vacía antes de borrarla).
   */
  async listChildren(parentId: string): Promise<FolderChildren> {
    const folders: FolderRef[] = [];
    const files: FileRef[] = [];
    let pageToken: string | undefined;
    do {
      const params = this.shared(
        new URLSearchParams({
          q: `'${q(parentId)}' in parents and trashed=false`,
          fields: 'nextPageToken, files(id,name,mimeType,size,modifiedTime)',
          pageSize: '200',
        })
      );
      if (pageToken) params.set('pageToken', pageToken);
      const json = (await (await this.call(`${API}/files?${params}`)).json()) as {
        nextPageToken?: string;
        files?: { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string }[];
      };
      for (const f of json.files ?? []) {
        if (f.mimeType === FOLDER_MIME) folders.push({ id: f.id, name: f.name });
        else {
          files.push({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            sizeBytes: Number(f.size ?? 0),
            modifiedAt: f.modifiedTime ? new Date(f.modifiedTime) : null,
          });
        }
      }
      pageToken = json.nextPageToken;
    } while (pageToken);
    return { folders, files };
  }

  /**
   * Procedencia real: padres actuales y si Drive lo reporta como
   * compartido. `shared` en la API de Drive es cierto para cualquier
   * archivo al que otro usuario (no el dueño) tenga algún permiso —
   * justo la señal de "no borrar" que pide PASO 9.
   */
  async inspectOwnership(id: string): Promise<OwnershipInfo> {
    const params = this.shared(new URLSearchParams({ fields: 'id,parents,shared' }));
    const res = await this.callTolerantOf404(`${API}/files/${encodeURIComponent(id)}?${params}`);
    if (!res) return { exists: false, parents: [], shared: false };
    const json = (await res.json()) as { parents?: string[]; shared?: boolean };
    return { exists: true, parents: json.parents ?? [], shared: !!json.shared };
  }

  /**
   * Borrado DEFINITIVO — `DELETE`, no el `PATCH trashed:true` de
   * `deleteFile`. Sirve igual para un archivo o una carpeta: en Drive
   * ambos son el mismo tipo de recurso ("files") y el mismo verbo los
   * borra a los dos; lo que decide CUÁNDO se llama (solo tras
   * verificar cada hijo) es quien orquesta, no este método.
   */
  private async deletePermanently(id: string): Promise<void> {
    const params = this.shared(new URLSearchParams());
    await this.callTolerantOf404(`${API}/files/${encodeURIComponent(id)}?${params}`, { method: 'DELETE' });
  }

  async deleteFilePermanently(id: string): Promise<void> {
    return this.deletePermanently(id);
  }

  async deleteFolderPermanently(id: string): Promise<void> {
    return this.deletePermanently(id);
  }

  async moveFile(id: string, toParentId: string): Promise<void> {
    const current = (await (
      await this.call(`${API}/files/${encodeURIComponent(id)}?${this.shared(new URLSearchParams({ fields: 'parents' }))}`)
    ).json()) as { parents?: string[] };

    const params = this.shared(new URLSearchParams({ addParents: toParentId, fields: 'id' }));
    if (current.parents?.length) params.set('removeParents', current.parents.join(','));
    await this.call(`${API}/files/${encodeURIComponent(id)}?${params}`, { method: 'PATCH' });
  }

  async copyFile(id: string, toParentId: string, newName?: string): Promise<FileRef> {
    const params = this.shared(new URLSearchParams({ fields: 'id,name,mimeType,size,modifiedTime' }));
    const res = await this.call(`${API}/files/${encodeURIComponent(id)}/copy?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parents: [toParentId], ...(newName ? { name: newName } : {}) }),
    });
    const json = (await res.json()) as { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string };
    return {
      id: json.id,
      name: json.name,
      mimeType: json.mimeType,
      sizeBytes: Number(json.size ?? 0),
      modifiedAt: json.modifiedTime ? new Date(json.modifiedTime) : null,
    };
  }

  async getMetadata(id: string): Promise<FileRef | null> {
    try {
      const params = this.shared(new URLSearchParams({ fields: 'id,name,mimeType,size,modifiedTime' }));
      const json = (await (await this.call(`${API}/files/${encodeURIComponent(id)}?${params}`)).json()) as {
        id: string; name: string; mimeType: string; size?: string; modifiedTime?: string;
      };
      return {
        id: json.id,
        name: json.name,
        mimeType: json.mimeType,
        sizeBytes: Number(json.size ?? 0),
        modifiedAt: json.modifiedTime ? new Date(json.modifiedTime) : null,
      };
    } catch {
      return null;
    }
  }

  async listFolder(parentId: string): Promise<FileRef[]> {
    const params = this.shared(
      new URLSearchParams({
        q: `'${q(parentId)}' in parents and trashed=false and mimeType!='${FOLDER_MIME}'`,
        fields: 'files(id,name,mimeType,size,modifiedTime)',
        pageSize: '200',
      })
    );
    const json = (await (await this.call(`${API}/files?${params}`)).json()) as {
      files?: { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string }[];
    };
    return (json.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      sizeBytes: Number(f.size ?? 0),
      modifiedAt: f.modifiedTime ? new Date(f.modifiedTime) : null,
    }));
  }

  async searchFiles({ query, parentId, limit = 50 }: SearchInput): Promise<FileRef[]> {
    const filters = [
      `name contains '${q(query)}'`,
      'trashed=false',
      `mimeType!='${FOLDER_MIME}'`,
      parentId ? `'${q(parentId)}' in parents` : null,
    ]
      .filter(Boolean)
      .join(' and ');

    const params = this.shared(
      new URLSearchParams({ q: filters, fields: 'files(id,name,mimeType,size,modifiedTime)', pageSize: String(limit) })
    );
    const json = (await (await this.call(`${API}/files?${params}`)).json()) as {
      files?: { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string }[];
    };
    return (json.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      sizeBytes: Number(f.size ?? 0),
      modifiedAt: f.modifiedTime ? new Date(f.modifiedTime) : null,
    }));
  }

  async renameFile(id: string, newName: string): Promise<void> {
    const params = this.shared(new URLSearchParams({ fields: 'id' }));
    await this.call(`${API}/files/${encodeURIComponent(id)}?${params}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
  }

  async healthCheck() {
    try {
      const params = this.shared(new URLSearchParams({ fields: 'user(emailAddress),storageQuota(limit,usage)' }));
      const json = (await (await this.call(`${API}/about?${params}`)).json()) as {
        user?: { emailAddress?: string };
        storageQuota?: { limit?: string; usage?: string };
      };
      const cuenta = json.user?.emailAddress ?? this.config.clientEmail ?? 'cuenta autorizada';
      const usado = json.storageQuota?.usage ? `${(Number(json.storageQuota.usage) / 1e9).toFixed(1)} GB usados` : '';
      return { ok: true, detail: `Conectado como ${cuenta}. ${usado}`.trim() };
    } catch (e: any) {
      return { ok: false, detail: e?.message ?? 'No se pudo conectar con Google Drive.' };
    }
  }
}
