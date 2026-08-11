/**
 * Reglas de acceso al repositorio — lógica pura, sin base de datos,
 * para poder probarla exhaustivamente.
 *
 * Un error acá expone documentos privados de un condómino a otro, así
 * que la regla es: **si no está permitido explícitamente, se niega**.
 */

export type Actor = {
  role: string;
  companyId: string;
  /** Persona vinculada al usuario, si es residente. */
  personId?: string | null;
  /** Condominios que el supervisor tiene asignados. */
  assignedCondoIds?: string[];
  /** Áreas otorgadas si es miembro de la junta directiva. */
  isBoardMember?: boolean;
};

export type FolderTarget = {
  companyId: string | null;
  condominiumId: string | null;
  /** Si es la carpeta individual de un residente, de quién. */
  personId: string | null;
  kind: string;
  slug: string;
  /** Roles autorizados de la carpeta. Vacío = nadie salvo el master. */
  allowedRoles: string[];
};

export type Decision = { allowed: boolean; reason: string };

const deny = (reason: string): Decision => ({ allowed: false, reason });
const allow = (reason: string): Decision => ({ allowed: true, reason });

/**
 * ¿Este actor puede LEER esta carpeta y su contenido?
 *
 * Orden de las verificaciones, de la más fuerte a la más débil:
 *  1. El master ve todo (es el dueño de la plataforma).
 *  2. Aislamiento de empresa: nunca se cruza entre administradoras.
 *  3. Carpeta de residente: solo su dueño y la administración.
 *  4. Alcance del supervisor: solo sus condominios asignados.
 *  5. Rol autorizado en la carpeta.
 */
export function canReadFolder(actor: Actor, folder: FolderTarget): Decision {
  if (actor.role === 'master') return allow('El usuario master tiene acceso completo.');

  // Las carpetas de plataforma (raíz y contenedor de condominios) no
  // pertenecen a ninguna empresa y no contienen archivos.
  if (folder.companyId && folder.companyId !== actor.companyId) {
    return deny('La carpeta pertenece a otra empresa administradora.');
  }

  // --- Carpeta individual de un residente ---
  if (folder.personId) {
    if (actor.role === 'condomino') {
      return actor.personId === folder.personId
        ? allow('Es su propia carpeta.')
        : deny('Un residente solo accede a su propia carpeta.');
    }
    // La administración necesita entrar para depositar estados de
    // cuenta y cartas. El personal de seguridad y la junta, no.
    if (['admin_owner', 'admin_staff', 'contador'].includes(actor.role)) {
      return supervisorScope(actor, folder, 'Administra el condominio de ese residente.');
    }
    return deny('Ese rol no accede a las carpetas de los residentes.');
  }

  // --- Un residente no entra a ninguna otra carpeta ---
  if (actor.role === 'condomino') {
    return deny('El residente solo accede a su propia carpeta.');
  }

  // --- Junta directiva: solo si además es miembro ---
  if (actor.role === 'junta_directiva' && !actor.isBoardMember) {
    return deny('El usuario no está registrado como miembro de la junta directiva.');
  }

  if (!folder.allowedRoles.includes(actor.role)) {
    return deny('Ese rol no tiene acceso a esta carpeta.');
  }

  return supervisorScope(actor, folder, 'Rol autorizado en la carpeta.');
}

/**
 * ¿Puede LEER este archivo en concreto?
 *
 * Regla adicional a la de carpeta: un residente puede leer un documento
 * DIRIGIDO A ÉL (`ownerPersonId`) aunque viva en una carpeta de la
 * administración. Es el caso de los avisos de incumplimiento, los
 * estados de cuenta y las certificaciones: la administración los emite
 * en su carpeta de trabajo, pero el destinatario tiene que poder
 * abrirlos. Solo abre ESE archivo, nunca la carpeta.
 */
export function canReadObject(
  actor: Actor,
  folder: FolderTarget,
  object: { ownerPersonId: string | null }
): Decision {
  const byFolder = canReadFolder(actor, folder);
  if (byFolder.allowed) return byFolder;

  if (
    actor.role === 'condomino' &&
    actor.personId &&
    object.ownerPersonId === actor.personId &&
    folder.companyId === actor.companyId
  ) {
    return allow('El documento está dirigido a esta persona.');
  }
  return byFolder;
}

/** El supervisor solo llega a los condominios que le asignaron. */
function supervisorScope(actor: Actor, folder: FolderTarget, okReason: string): Decision {
  if (actor.role !== 'admin_staff' || !folder.condominiumId) return allow(okReason);
  const assigned = actor.assignedCondoIds ?? [];
  return assigned.includes(folder.condominiumId)
    ? allow(okReason)
    : deny('El supervisor no tiene ese condominio asignado.');
}

/**
 * ¿Puede ESCRIBIR (subir, renombrar, eliminar) en esta carpeta?
 *
 * Leer y escribir no son lo mismo: la junta directiva consulta actas y
 * contratos pero no los sube, y un residente no deposita nada en su
 * propia carpeta — es la administración la que le entrega documentos.
 */
export function canWriteFolder(actor: Actor, folder: FolderTarget): Decision {
  const read = canReadFolder(actor, folder);
  if (!read.allowed) return read;

  if (actor.role === 'master') return allow('El usuario master tiene acceso completo.');

  if (actor.role === 'condomino') {
    return deny('El residente consulta sus documentos, pero no los deposita.');
  }
  if (actor.role === 'junta_directiva') {
    return deny('La junta directiva consulta, no modifica el repositorio.');
  }
  if (actor.role === 'contador') {
    // El contador trabaja con lo financiero.
    const financiero = ['facturas', 'administracion/estados-de-cuenta'];
    return financiero.some((f) => folder.slug === f || folder.slug.startsWith(`${f}/`))
      ? allow('El contador administra la documentación financiera.')
      : deny('El contador solo modifica la documentación financiera.');
  }
  if (actor.role === 'seguridad') {
    const propio = ['seguridad'];
    return propio.some((f) => folder.slug === f || folder.slug.startsWith(`${f}/`))
      ? allow('Seguridad administra su propia documentación.')
      : deny('Seguridad solo modifica su propia documentación.');
  }
  if (folder.slug === 'respaldos') {
    return deny('Los respaldos de plataforma los administra únicamente el master.');
  }

  return allow('La administración del condominio puede modificar el repositorio.');
}

/** ¿Puede eliminar? Más estricto que escribir: nunca el supervisor. */
export function canDeleteObject(actor: Actor, folder: FolderTarget): Decision {
  const write = canWriteFolder(actor, folder);
  if (!write.allowed) return write;
  if (actor.role === 'admin_staff') {
    return deny('El supervisor puede subir documentos, pero no eliminarlos.');
  }
  return allow(write.reason);
}
