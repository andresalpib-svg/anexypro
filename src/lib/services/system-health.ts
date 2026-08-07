import { prisma } from '@/lib/db';

/**
 * Estado del sistema: comprueba EN VIVO cada servicio del que depende
 * ANEXYpro y dice qué hacer cuando alguno no responde.
 *
 * POR QUÉ EXISTE. Todo lo externo —el correo, el almacenamiento, la
 * IA, el programador— se configura una vez con una variable de entorno
 * y después nadie lo vuelve a mirar. Cuando una de esas credenciales
 * caduca o se revoca, el sistema no se cae: sigue funcionando y falla
 * SOLO en el momento en que alguien la necesita, con un error opaco y
 * en medio de una gestión.
 *
 * Pasó de verdad: la clave de Resend guardada en producción llevaba
 * quién sabe cuánto tiempo inválida. Nadie podía saberlo hasta que un
 * residente se quedaba sin su correo de bienvenida. Esta pantalla
 * convierte esa clase de avería silenciosa en algo que se ve de un
 * vistazo.
 *
 * REGLAS DE ESTE MÓDULO:
 *  - Ninguna comprobación puede lanzar. Un servicio caído es un
 *    resultado, no una excepción; si una tirara, tumbaría la pantalla
 *    que existe justamente para diagnosticar.
 *  - Toda llamada de red lleva plazo máximo. Sin él, un proveedor que
 *    no responde deja la pantalla colgada.
 *  - Cada fallo trae la instrucción concreta de cómo arreglarlo. Un
 *    "error de correo" sin el paso siguiente no sirve de nada.
 */

export type EstadoCheck = 'ok' | 'aviso' | 'error' | 'apagado';

export type Comprobacion = {
  clave: string;
  titulo: string;
  estado: EstadoCheck;
  /** Qué se encontró, en una línea. */
  detalle: string;
  /** Qué hacer para arreglarlo. Solo cuando hay algo que hacer. */
  arreglo?: string;
  /** Milisegundos que tardó la comprobación. */
  ms: number;
};

/** Plazo máximo de cualquier llamada a un tercero. */
const PLAZO_MS = 8000;

async function medir(
  clave: string,
  titulo: string,
  fn: () => Promise<Omit<Comprobacion, 'clave' | 'titulo' | 'ms'>>
): Promise<Comprobacion> {
  const desde = Date.now();
  try {
    const r = await fn();
    return { clave, titulo, ...r, ms: Date.now() - desde };
  } catch (e: any) {
    return {
      clave,
      titulo,
      estado: 'error',
      detalle: e?.message ? String(e.message).slice(0, 220) : 'Fallo inesperado al comprobar.',
      arreglo: 'Revisá los registros del servidor para el detalle técnico.',
      ms: Date.now() - desde,
    };
  }
}

/** `fetch` con plazo, para que ningún proveedor deje la pantalla colgada. */
async function pedir(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(PLAZO_MS), cache: 'no-store' });
}

// ---------- Base de datos ----------

async function comprobarBaseDeDatos() {
  return medir('base', 'Base de datos', async () => {
    // `companies` no lleva RLS, así que se puede consultar sin contexto
    // de empresa — es justo lo que hace falta para una comprobación
    // que corre sin sesión de tenant.
    const empresas = await prisma.company.count();
    const anfitrion = (process.env.DATABASE_URL ?? '').replace(/^.*@/, '').replace(/\/.*$/, '') || 'desconocido';
    return {
      estado: 'ok' as const,
      detalle: `Responde. ${empresas} empresa(s) registradas · ${anfitrion}`,
    };
  });
}

// ---------- Correo saliente (Resend) ----------

/** Extrae el dominio de un remitente tipo `Nombre <buzon@dominio>`. */
export function dominioDelRemitente(from?: string | null): string | null {
  const m = (from ?? '').match(/[^<\s@]+@([^>\s]+)/);
  return m ? m[1]!.toLowerCase() : null;
}

async function comprobarCorreo() {
  return medir('correo', 'Correo saliente (Resend)', async () => {
    const clave = process.env.RESEND_API_KEY;
    const remitente = process.env.EMAIL_FROM;

    if (!clave || !remitente) {
      const faltan = [!clave && 'RESEND_API_KEY', !remitente && 'EMAIL_FROM'].filter(Boolean);
      return {
        estado: 'apagado' as const,
        detalle: `Sin configurar: falta ${faltan.join(' y ')}.`,
        arreglo: `Mientras falte, el sistema NO envía correos: ni bienvenidas de residentes ni el alta masiva de usuarios. Agregá ${
          faltan.length > 1 ? 'las dos variables' : faltan[0]
        } en Vercel (o en el .env local).`,
      };
    }

    const res = await pedir('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${clave}` },
    });

    if (res.status === 401 || res.status === 400) {
      return {
        estado: 'error' as const,
        detalle: `Resend rechaza la clave (HTTP ${res.status}). No se puede enviar ningún correo.`,
        arreglo:
          'Generá una API key nueva en resend.com/api-keys y actualizá RESEND_API_KEY en Vercel. La clave anterior fue revocada o ya no existe.',
      };
    }
    if (!res.ok) {
      return {
        estado: 'error' as const,
        detalle: `Resend respondió HTTP ${res.status}.`,
        arreglo: 'Revisá el estado del servicio en resend.com antes de tocar la configuración.',
      };
    }

    const cuerpo = (await res.json().catch(() => ({}))) as { data?: { name: string; status: string }[] };
    const dominios = cuerpo.data ?? [];
    const dominio = dominioDelRemitente(remitente);
    const propio = dominios.find((d) => d.name?.toLowerCase() === dominio);

    if (!dominio) {
      return {
        estado: 'error' as const,
        detalle: `EMAIL_FROM no tiene un correo válido: "${remitente}".`,
        arreglo: 'Debe tener la forma `ANEXYpro <buzon@tudominio.com>`.',
      };
    }
    if (!propio) {
      return {
        estado: 'error' as const,
        detalle: `La clave funciona, pero el dominio "${dominio}" no está dado de alta en Resend.`,
        arreglo: `Agregá "${dominio}" en Resend → Domains y publicá en tu DNS los registros SPF y DKIM que te indique. Sin eso Resend rechaza el envío.`,
      };
    }
    if (propio.status !== 'verified') {
      return {
        estado: 'aviso' as const,
        detalle: `El dominio "${dominio}" está en Resend pero su estado es "${propio.status}". Hasta que quede "verified" no sale ningún correo desde ese dominio.`,
        arreglo:
          'Publicá en tu DNS los registros que da Resend (Domains → el dominio): el DKIM en `resend._domainkey` y, en el subdominio `send`, un MX y un TXT. ' +
          'El SPF de Resend va en ese subdominio, así que NO toques el SPF del dominio raíz — el que usa tu proveedor de buzones se queda como está.',
      };
    }
    return {
      estado: 'ok' as const,
      detalle: `Clave válida y dominio "${dominio}" verificado. Remitente: ${remitente}`,
    };
  });
}

// ---------- Almacenamiento de documentos ----------

async function comprobarAlmacenamiento() {
  return medir('almacenamiento', 'Repositorio de documentos', async () => {
    const { getStorageSettings, buildProvider, PROVIDER_LABEL } = await import('@/lib/storage');
    const ajustes = await getStorageSettings();
    const etiqueta = PROVIDER_LABEL[ajustes.provider] ?? ajustes.provider;

    const proveedor = buildProvider(ajustes.provider, ajustes.config);
    const salud = await proveedor.healthCheck();
    if (!salud.ok) {
      return {
        estado: 'error' as const,
        detalle: `${etiqueta}: ${salud.detail}`,
        arreglo:
          'Los archivos nuevos no se van a poder guardar. Revisá las credenciales del proveedor en Almacenamiento; los archivos ya guardados no se pierden.',
      };
    }
    return { estado: 'ok' as const, detalle: `${etiqueta}: ${salud.detail}` };
  });
}

// ---------- Asistentes de IA ----------

async function comprobarIA() {
  return medir('ia', 'Asistentes de IA', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        estado: 'apagado' as const,
        detalle: 'Sin ANTHROPIC_API_KEY.',
        arreglo:
          'Los asistentes siguen respondiendo con el redactor propio del sistema, con las mismas cifras; solo se pierde la redacción de la IA.',
      };
    }
    // Consulta de solo lectura: lista los modelos, no consume tokens de
    // generación.
    const res = await pedir('https://api.anthropic.com/v1/models?limit=1', {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
    });
    if (res.status === 401 || res.status === 403) {
      return {
        estado: 'error' as const,
        detalle: `La clave de Anthropic fue rechazada (HTTP ${res.status}).`,
        arreglo: 'Generá una clave nueva en console.anthropic.com y actualizá ANTHROPIC_API_KEY.',
      };
    }
    if (!res.ok) {
      return { estado: 'aviso' as const, detalle: `Anthropic respondió HTTP ${res.status}.` };
    }
    return { estado: 'ok' as const, detalle: 'Clave válida.' };
  });
}

// ---------- Programador de tareas ----------

const HORAS_SIN_CORRER_PARA_AVISAR = 36;

async function comprobarProgramador() {
  return medir('programador', 'Programador de tareas', async () => {
    const ultima = await prisma.jobRun.findFirst({
      orderBy: { startedAt: 'desc' },
      select: { jobName: true, startedAt: true, status: true, summary: true },
    });

    if (!process.env.CRON_SECRET) {
      return {
        estado: 'error' as const,
        detalle: 'Sin CRON_SECRET: el acceso por cabecera a /api/cron está deshabilitado.',
        arreglo:
          'Sin esto NINGÚN proceso automático corre: ni intereses moratorios, ni cobranza, ni gastos recurrentes, ni avisos de contratos. Definí CRON_SECRET y programá la llamada diaria a /api/cron.',
      };
    }

    if (!ultima) {
      return {
        estado: 'error' as const,
        detalle: 'El programador nunca ha corrido.',
        arreglo:
          'Falta la llamada diaria a /api/cron con la cabecera del CRON_SECRET. Hasta que exista, los procesos automáticos no se ejecutan.',
      };
    }

    const horas = (Date.now() - ultima.startedAt.getTime()) / 36e5;
    const cuando = ultima.startedAt.toLocaleString('es-CR');
    if (horas > HORAS_SIN_CORRER_PARA_AVISAR) {
      return {
        estado: 'error' as const,
        detalle: `La última corrida fue hace ${Math.round(horas)} h (${cuando}).`,
        arreglo: 'La llamada diaria dejó de ocurrir. Revisá el programador que golpea /api/cron.',
      };
    }
    if (ultima.status === 'error') {
      return {
        estado: 'aviso' as const,
        detalle: `La última corrida ("${ultima.jobName}", ${cuando}) terminó con error.`,
        arreglo: 'Mirá la bitácora de corridas para el motivo.',
      };
    }
    return { estado: 'ok' as const, detalle: `Última corrida: ${ultima.jobName} · ${cuando}` };
  });
}

// ---------- Acceso ----------

/** Anfitrión de una URL, o `null` si no es una URL válida. */
function anfitrionDe(url?: string | null): string | null {
  try {
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
}

async function comprobarAcceso(anfitrionActual?: string) {
  return medir('acceso', 'Direcciones y sesiones', async () => {
    const secreto = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
    if (!secreto) {
      return {
        estado: 'error' as const,
        detalle: 'Falta NEXTAUTH_SECRET / AUTH_SECRET.',
        arreglo:
          'Sin el secreto no se pueden firmar sesiones ni los enlaces de recuperación y descarga. Definilo antes de cualquier otra cosa.',
      };
    }

    const urlAuth = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
    const urlApp = process.env.APP_URL;
    const hostAuth = anfitrionDe(urlAuth);
    const hostApp = anfitrionDe(urlApp);

    // APP_URL es la dirección que viaja DENTRO de los correos. Un valor
    // equivocado aquí no rompe nada visible desde adentro: el sistema
    // sigue funcionando y son los residentes los que reciben un enlace
    // que no lleva a ningún lado. Por eso se comprueba, y por eso es
    // error y no aviso.
    if (hostApp && anfitrionActual && hostApp !== anfitrionActual) {
      return {
        estado: 'error' as const,
        detalle: `APP_URL apunta a "${hostApp}" pero la plataforma se está usando desde "${anfitrionActual}".`,
        arreglo:
          'Los enlaces de los correos de bienvenida y de recuperación de contraseña llevan a esa dirección, así que hoy le estarían mandando a los residentes un enlace muerto. Corregí APP_URL al dominio real.',
      };
    }

    if (hostAuth && anfitrionActual && hostAuth !== anfitrionActual) {
      return {
        estado: 'aviso' as const,
        detalle: `NEXTAUTH_URL apunta a "${hostAuth}" pero estás entrando por "${anfitrionActual}".`,
        arreglo:
          'Si no coinciden, el inicio de sesión puede fallar con "UntrustedHost". Ajustá NEXTAUTH_URL al dominio por el que se usa realmente.',
      };
    }

    const partes = [urlAuth && `acceso: ${urlAuth}`, urlApp && `enlaces de correo: ${urlApp}`].filter(Boolean);
    return { estado: 'ok' as const, detalle: partes.join(' · ') || 'Secreto definido.' };
  });
}

// ---------- Todo junto ----------

export type ResumenSalud = {
  comprobaciones: Comprobacion[];
  /** El peor estado encontrado — es lo que se muestra en grande. */
  peor: EstadoCheck;
  generadoEn: Date;
};

/**
 * Corre TODAS las comprobaciones en paralelo. Una lenta no retrasa a
 * las demás, y el conjunto nunca tarda más que la más lenta.
 */
export async function comprobarSistema(anfitrionActual?: string): Promise<ResumenSalud> {
  const comprobaciones = await Promise.all([
    comprobarBaseDeDatos(),
    comprobarCorreo(),
    comprobarAlmacenamiento(),
    comprobarIA(),
    comprobarProgramador(),
    comprobarAcceso(anfitrionActual),
  ]);

  // "apagado" no es una avería: es una función que todavía no se usa.
  const orden: EstadoCheck[] = ['error', 'aviso', 'apagado', 'ok'];
  const peor = orden.find((e) => comprobaciones.some((c) => c.estado === e)) ?? 'ok';

  return { comprobaciones, peor, generadoEn: new Date() };
}

// ---------- Revisión automática diaria ----------

/**
 * Nombre del proceso en el programador. Vive aquí y no en el registro
 * de jobs para que la pantalla que lee su resultado y el job que lo
 * escribe no puedan discrepar.
 */
export const JOB_REVISION = 'revision-del-sistema';

/** Una línea por comprobación, para la bitácora. */
export function comoTexto(comprobaciones: Comprobacion[]): string {
  const marca: Record<EstadoCheck, string> = { ok: 'OK', aviso: 'AVISO', error: 'FALLA', apagado: 'SIN USAR' };
  return comprobaciones
    .map((c) => `[${marca[c.estado]}] ${c.titulo}: ${c.detalle}${c.arreglo ? ` → ${c.arreglo}` : ''}`)
    .join('\n');
}

export type RevisionPendiente = {
  /** `null` cuando la revisión nunca llegó a correr. */
  cuando: Date | null;
  /** El texto que dejó la revisión, tal cual. */
  detalle: string;
  motivo: 'fallas' | 'sin-revisar';
};

/** A partir de aquí, que no haya revisión reciente ya es en sí una falla. */
const HORAS_SIN_REVISAR = 48;

/**
 * Lo que hay que avisar en el panel, o `null` si no hay nada.
 *
 * Es una consulta sola a la bitácora, sin salir a la red: se puede
 * poner en el encabezado de una pantalla sin que cueste nada. La
 * comprobación de verdad la hizo el programador; esto solo lee lo que
 * anotó.
 *
 * AVISA DE DOS COSAS, Y LA SEGUNDA ES LA IMPORTANTE:
 *
 *  1. Que la última revisión encontró servicios caídos.
 *  2. Que hace demasiado que NO HAY revisión.
 *
 * Sin (2) el diseño tendría un agujero por el que se cae todo: la
 * revisión la corre el propio programador, así que si el programador se
 * detiene, nadie comprueba nada, nadie anota nada, y el panel se queda
 * mostrando la última foto —probablemente buena— para siempre. El
 * silencio pasaría por buena noticia justo cuando dejó de serlo.
 */
export async function revisionPendiente(): Promise<RevisionPendiente | null> {
  const ultima = await prisma.jobRun
    .findFirst({
      where: { jobName: JOB_REVISION },
      orderBy: { startedAt: 'desc' },
      select: { status: true, error: true, endedAt: true, startedAt: true },
    })
    .catch(() => null);

  if (!ultima) {
    return {
      cuando: null,
      motivo: 'sin-revisar',
      detalle:
        'La revisión automática nunca ha corrido, así que nadie está vigilando las credenciales ni los servicios externos.\n\nLa ejecuta el programador diario: hace falta CRON_SECRET y la llamada a /api/cron.',
    };
  }

  const cuando = ultima.endedAt ?? ultima.startedAt;
  const horas = (Date.now() - cuando.getTime()) / 36e5;
  if (horas > HORAS_SIN_REVISAR) {
    return {
      cuando,
      motivo: 'sin-revisar',
      detalle:
        `Hace ${Math.round(horas / 24)} día(s) que no se revisa el sistema: el programador dejó de correr.\n\n` +
        'Mientras siga así, una credencial que caduque no va a avisar por ningún lado.',
    };
  }

  if (ultima.status === 'error' && ultima.error) {
    return { cuando, motivo: 'fallas', detalle: ultima.error };
  }
  return null;
}
