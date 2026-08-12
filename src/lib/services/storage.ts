import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma, withTenantContext, forEachCompany } from '@/lib/db';
import { activeProvider, getStorageSettings, providerForCompany } from '@/lib/storage';
import type { StorageKind } from '@/lib/storage/provider';
import { CONDO_TREE, CONDOS_NAME, DEMOS_NAME, ROOT_NAME, demoFolderName, flattenTree, residentSlug, RESIDENTS_SLUG } from '@/lib/storage/tree';
import { canReadFolder, canReadObject, canWriteFolder, canDeleteObject, type Actor } from '@/lib/storage/permissions';
import { logActivity } from '@/lib/services/audit';

/**
 * Repositorio de documentos — cara visible para el resto del sistema.
 *
 * Los módulos llaman a estas funciones. NUNCA a un proveedor, y menos a
 * la API de Google Drive. Ese es el contrato que hace posible cambiar
 * de proveedor sin tocar nada más.
 */

const MAX_BYTES = 100 * 1024 * 1024;

/**
 * Consulta del repositorio dentro del contexto de la empresa, que es lo
 * que exige Row-Level Security.
 *
 * Se abre un contexto CORTO por consulta en vez de envolver la función
 * entera: entre una consulta y otra hay llamadas al proveedor de
 * archivos —crear carpeta, subir, descargar, mover—, y mantener abierta
 * una transacción de Postgres mientras se sube un archivo de 100 MB
 * agota el pool de conexiones y arriesga un tiempo de espera agotado.
 *
 * El aislamiento no depende solo de esto: `permissions.ts` decide qué
 * puede ver cada actor carpeta por carpeta, y sus reglas están cubiertas
 * por pruebas. Esto es la segunda capa, en la base.
 */
function enEmpresa<T>(companyId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return withTenantContext(companyId, fn);
}

export type StoredFile = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
  updatedAt: Date;
  uploadedByName: string | null;
};

// ============================================================
// Árbol de carpetas
// ============================================================

/**
 * Carpeta raíz "ANEXYpro" y los contenedores "Condominios" y "DEMOS".
 *
 * Son filas compartidas por toda la plataforma (sin `companyId`), una
 * por cada `kind` de proveedor. Los dos contenedores se crean siempre
 * —cueste lo mismo que crear uno solo, e idempotente—, aunque la
 * empresa que dispara la llamada todavía no vaya a usar el de DEMOS:
 * así no hace falta decidir acá si esta empresa es demo o no, esa
 * decisión la toma `ensureCondoTree`, que es quien sabe bajo cuál
 * colgar la carpeta del condominio.
 */
async function ensureRoots(companyId: string): Promise<{ rootId: string; condosId: string; demosId: string; kind: StorageKind }> {
  const { kind, provider } = await providerForCompany(companyId);

  let root = await enEmpresa(companyId, (tx) =>
    tx.storageFolder.findFirst({
      where: { kind: 'raiz', provider: kind },
    })
  );
  if (!root) {
    const created = await provider.createFolder(ROOT_NAME);
    root = await enEmpresa(companyId, (tx) =>
      tx.storageFolder.create({
        data: {
          name: ROOT_NAME,
          slug: 'raiz',
          kind: 'raiz',
          provider: kind,
          providerFolderId: created.id,
          allowedRoles: ['master'],
        },
      })
    );
    await enEmpresa(companyId, (tx) =>
      tx.storageSettings.update({ where: { id: 'global' }, data: { rootFolderId: created.id } })
    );
  }

  let condos = await enEmpresa(companyId, (tx) =>
    tx.storageFolder.findFirst({
      where: { kind: 'condominios', provider: kind },
    })
  );
  if (!condos) {
    const created = await provider.createFolder(CONDOS_NAME, root.providerFolderId);
    condos = await enEmpresa(companyId, (tx) =>
      tx.storageFolder.create({
        data: {
          name: CONDOS_NAME,
          slug: 'condominios',
          kind: 'condominios',
          provider: kind,
          providerFolderId: created.id,
          parentId: root.id,
          allowedRoles: ['master'],
        },
      })
    );
  }

  // "DEMOS" (PASO 8): hermano de "Condominios", nunca su contenido.
  // Mismo `kind: 'condominios'` en la base (es el mismo TIPO de
  // contenedor — "una carpeta por cliente colgada de acá"); lo que los
  // distingue es el `slug`, que es lo único que se consulta.
  let demos = await enEmpresa(companyId, (tx) =>
    tx.storageFolder.findFirst({
      where: { slug: 'demos', provider: kind },
    })
  );
  if (!demos) {
    const created = await provider.createFolder(DEMOS_NAME, root.providerFolderId);
    demos = await enEmpresa(companyId, (tx) =>
      tx.storageFolder.create({
        data: {
          name: DEMOS_NAME,
          slug: 'demos',
          kind: 'condominios',
          provider: kind,
          providerFolderId: created.id,
          parentId: root.id,
          allowedRoles: ['master'],
        },
      })
    );
  }

  return { rootId: root.id, condosId: condos.id, demosId: demos.id, kind };
}

export type TreeResult = { created: number; existing: number; folders: number };

/**
 * Crea el árbol completo de un condominio.
 *
 * IDEMPOTENTE: se puede llamar cuantas veces sea necesario. Sirve tanto
 * al crear el condominio como para reparar un árbol incompleto o para
 * reconstruirlo después de cambiar de proveedor.
 */
export async function ensureCondoTree(companyId: string, condominiumId: string): Promise<TreeResult> {
  const condo = await enEmpresa(companyId, (tx) =>
    tx.condominium.findUniqueOrThrow({
      where: { id: condominiumId },
      select: { name: true, companyId: true, company: { select: { isDemo: true } } },
    })
  );
  const { condosId, demosId, kind } = await ensureRoots(companyId);
  const { provider } = await providerForCompany(companyId);

  // PASO 8: una empresa demo cuelga de "DEMOS", nunca de "Condominios"
  // — nunca comparte padre con un cliente real. El NOMBRE visible
  // ("DEMO_<companyId>") es solo para que un humano lo reconozca de
  // un vistazo en Drive; lo que de verdad la identifica es la columna
  // `company_id` de la fila (ver el `data:` de abajo) y el
  // `provider_folder_id` real de Drive — nunca el nombre.
  const esDemo = condo.company.isDemo;
  const padreId = esDemo ? demosId : condosId;
  const nombreCarpeta = esDemo ? demoFolderName(companyId) : condo.name;
  const padreFolder = await enEmpresa(companyId, (tx) =>
    tx.storageFolder.findUniqueOrThrow({ where: { id: padreId } })
  );

  const result: TreeResult = { created: 0, existing: 0, folders: 0 };

  // Carpeta del condominio (o de la demo, dentro de "DEMOS").
  let condoFolder = await enEmpresa(companyId, (tx) =>
    tx.storageFolder.findFirst({
      where: { condominiumId, slug: 'condominio' },
    })
  );
  const esCreacionNueva = !condoFolder;
  if (!condoFolder) {
    const made = await provider.createFolder(nombreCarpeta, padreFolder.providerFolderId);
    condoFolder = await enEmpresa(companyId, (tx) =>
      tx.storageFolder.create({
        data: {
          companyId,
          condominiumId,
          name: nombreCarpeta,
          slug: 'condominio',
          kind: 'condominio',
          provider: kind,
          providerFolderId: made.id,
          parentId: padreFolder.id,
          allowedRoles: ['master', 'admin_owner', 'admin_staff', 'contador'],
        },
      })
    );
    result.created += 1;
  } else if (condoFolder.provider !== kind) {
    // La fila viene de OTRO proveedor (p. ej. se activó Drive después de
    // trabajar en local): se crea la carpeta en el proveedor activo y la
    // fila se actualiza. Los archivos viejos no se mueven — cada objeto
    // recuerda su proveedor y se sigue leyendo de ahí.
    const made = await provider.createFolder(nombreCarpeta, padreFolder.providerFolderId);
    condoFolder = await enEmpresa(companyId, (tx) =>
      tx.storageFolder.update({
        where: { id: condoFolder!.id },
        data: { provider: kind, providerFolderId: made.id, parentId: padreFolder.id },
      })
    );
    result.created += 1;
  } else {
    result.existing += 1;
  }

  // PASO 8 — "Guardar en la base de datos": demo_id/tenant_id ya ES
  // `companyId` (la fila de `Company` es el tenant); esto guarda,
  // ADEMÁS y de forma explícita en la propia fila de la empresa, el
  // `google_drive_folder_id` real, el nombre de la carpeta y cuándo se
  // creó — para que un futuro proceso de limpieza (todavía no
  // implementado) pueda encontrar la carpeta exclusiva de una demo con
  // UNA sola lectura, sin tener que reconstruir el árbol de
  // `StorageFolder`. La fecha de creación solo se fija la PRIMERA vez
  // (`esCreacionNueva`); si más tarde cambia de proveedor, el id se
  // actualiza pero la fecha original no se pisa.
  if (esDemo) {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        demoDriveFolderId: condoFolder.providerFolderId,
        demoDriveFolderName: condoFolder.name,
        ...(esCreacionNueva ? { demoDriveFolderCreatedAt: condoFolder.createdAt } : {}),
      },
    });
  }

  // Secciones y subsecciones, en orden: los padres antes que los hijos.
  const byslug = new Map<string, string>(); // slug lógico → id de fila
  byslug.set('condominio', condoFolder.id);

  for (const spec of flattenTree(CONDO_TREE)) {
    result.folders += 1;
    const existing = await enEmpresa(companyId, (tx) =>
      tx.storageFolder.findUnique({
        where: { condominiumId_slug: { condominiumId, slug: spec.slug } },
      })
    );
    if (existing && existing.provider === kind) {
      byslug.set(spec.slug, existing.id);
      result.existing += 1;
      continue;
    }

    // Los padres se procesan antes que los hijos (orden de flattenTree),
    // así que a esta altura el padre ya está en el proveedor activo.
    const parentSlug = spec.slug.includes('/') ? spec.slug.slice(0, spec.slug.lastIndexOf('/')) : 'condominio';
    const parentRowId = byslug.get(parentSlug) ?? condoFolder.id;
    const parentRow = await enEmpresa(companyId, (tx) =>
      tx.storageFolder.findUniqueOrThrow({ where: { id: parentRowId } })
    );

    const made = await provider.createFolder(spec.name, parentRow.providerFolderId);
    const row = existing
      ? await enEmpresa(companyId, (tx) =>
          tx.storageFolder.update({
            where: { id: existing.id },
            data: { provider: kind, providerFolderId: made.id, parentId: parentRow.id },
          })
        )
      : await enEmpresa(companyId, (tx) =>
          tx.storageFolder.create({
            data: {
              companyId,
              condominiumId,
              name: spec.name,
              slug: spec.slug,
              kind: spec.slug.includes('/') ? 'subseccion' : 'seccion',
              provider: kind,
              providerFolderId: made.id,
              parentId: parentRow.id,
              allowedRoles: spec.roles ?? parentRow.allowedRoles,
            },
          })
        );
    byslug.set(spec.slug, row.id);
    result.created += 1;
  }

  return result;
}

/**
 * Carpeta individual del residente, dentro de "Residentes".
 *
 * El nombre visible es el de la persona, pero el `slug` usa su id: si
 * mañana se corrige el nombre, la carpeta sigue siendo la misma y no se
 * duplica.
 */
export async function ensureResidentFolder(companyId: string, condominiumId: string, personId: string) {
  const slug = residentSlug(personId);
  const existing = await enEmpresa(companyId, (tx) =>
    tx.storageFolder.findUnique({
      where: { condominiumId_slug: { condominiumId, slug } },
    })
  );
  if (existing) return existing;

  const person = await enEmpresa(companyId, (tx) =>
    tx.person.findUniqueOrThrow({
      where: { id: personId },
      select: { fullName: true },
    })
  );
  // El contenedor tiene que existir antes.
  let parent = await enEmpresa(companyId, (tx) =>
    tx.storageFolder.findUnique({
      where: { condominiumId_slug: { condominiumId, slug: RESIDENTS_SLUG } },
    })
  );
  if (!parent) {
    await ensureCondoTree(companyId, condominiumId);
    parent = await enEmpresa(companyId, (tx) =>
      tx.storageFolder.findUniqueOrThrow({
        where: { condominiumId_slug: { condominiumId, slug: RESIDENTS_SLUG } },
      })
    );
  }

  const { kind, provider } = await providerForCompany(companyId);
  // El contenedor puede venir de un proveedor anterior.
  const parentSync = await syncFolderWithActiveProvider(companyId, parent.id);
  const made = await provider.createFolder(person.fullName, parentSync.providerFolderId);

  return enEmpresa(companyId, (tx) =>
    tx.storageFolder.create({
      data: {
        companyId,
        condominiumId,
        personId,
        name: person.fullName,
        slug,
        kind: 'residente',
        provider: kind,
        providerFolderId: made.id,
        parentId: parentSync.id,
        // Vacío a propósito: el acceso lo resuelve la regla de carpeta de
        // residente, que compara la persona, no el rol.
        allowedRoles: [],
      },
    })
  );
}

/**
 * Carpeta de la EMPRESA, para archivos que no pertenecen a ningún
 * condominio: fotos de perfil del personal, logos de proveedores de
 * plataforma. Van fuera del árbol de condominios para que nunca
 * aparezcan en el repositorio de un condominio.
 */
export async function ensureCompanyFolder(companyId: string, slug: string, name: string) {
  const existing = await enEmpresa(companyId, (tx) =>
    tx.storageFolder.findFirst({
      where: { companyId, condominiumId: null, slug: `empresa/${slug}` },
    })
  );
  if (existing) return existing;

  const { kind, provider } = await providerForCompany(companyId);
  const { rootId } = await ensureRoots(companyId);
  const root = await enEmpresa(companyId, (tx) =>
    tx.storageFolder.findUniqueOrThrow({ where: { id: rootId } })
  );

  // Contenedor "Empresas", común a la plataforma — una fila por
  // proveedor, igual que la raíz: una empresa demo forzada a `local`
  // no debe reutilizar el contenedor de Drive.
  let empresas = await enEmpresa(companyId, (tx) =>
    tx.storageFolder.findFirst({
      where: { companyId: null, condominiumId: null, slug: 'empresas', provider: kind },
    })
  );
  if (!empresas) {
    const made = await provider.createFolder('Empresas', root.providerFolderId);
    empresas = await enEmpresa(companyId, (tx) =>
      tx.storageFolder.create({
        data: {
          name: 'Empresas',
          slug: 'empresas',
          kind: 'condominios',
          provider: kind,
          providerFolderId: made.id,
          parentId: root.id,
          allowedRoles: ['master'],
        },
      })
    );
  }

  // Carpeta de esta empresa.
  let empresa = await enEmpresa(companyId, (tx) =>
    tx.storageFolder.findFirst({
      where: { companyId, condominiumId: null, slug: 'empresa', provider: kind },
    })
  );
  if (!empresa) {
    const company = await enEmpresa(companyId, (tx) =>
      tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { legalName: true, tradeName: true },
      })
    );
    const made = await provider.createFolder(company.tradeName ?? company.legalName, empresas.providerFolderId);
    empresa = await enEmpresa(companyId, (tx) =>
      tx.storageFolder.create({
        data: {
          companyId,
          name: company.tradeName ?? company.legalName,
          slug: 'empresa',
          kind: 'condominio',
          provider: kind,
          providerFolderId: made.id,
          parentId: empresas.id,
          allowedRoles: ['master', 'admin_owner', 'admin_staff', 'contador', 'seguridad', 'condomino'],
        },
      })
    );
  }

  // La cadena empresa/empresas puede venir de un proveedor anterior.
  const empresaSync = await syncFolderWithActiveProvider(companyId, empresa.id);
  const made = await provider.createFolder(name, empresaSync.providerFolderId);
  return enEmpresa(companyId, (tx) =>
    tx.storageFolder.create({
      data: {
        companyId,
        name,
        slug: `empresa/${slug}`,
        kind: 'seccion',
        provider: kind,
        providerFolderId: made.id,
        parentId: empresaSync.id,
        // Estas carpetas guardan fotos de perfil y logos: los ve todo el
        // personal, y las fotos de perfil también el propio residente.
        allowedRoles: ['master', 'admin_owner', 'admin_staff', 'contador', 'seguridad', 'condomino'],
      },
    })
  );
}

/** Carpeta de un condominio por su ruta lógica; la crea si falta. */
export async function folderBySlug(companyId: string, condominiumId: string, slug: string) {
  const found = await enEmpresa(companyId, (tx) =>
    tx.storageFolder.findUnique({
      where: { condominiumId_slug: { condominiumId, slug } },
    })
  );
  if (found) return found;
  await ensureCondoTree(companyId, condominiumId);
  return enEmpresa(companyId, (tx) =>
    tx.storageFolder.findUniqueOrThrow({
      where: { condominiumId_slug: { condominiumId, slug } },
    })
  );
}

// ============================================================
// Actor y permisos
// ============================================================

export async function actorFromSession(session: {
  user: { id: string; companyId: string; role: string; personId?: string | null; isBoardMember?: boolean };
}): Promise<Actor> {
  const { id, companyId, role } = session.user;
  let assignedCondoIds: string[] = [];
  if (role === 'admin_staff') {
    const rows = await enEmpresa(companyId, (tx) =>
      tx.condominiumSupervisor.findMany({
        where: { userId: id },
        select: { condominiumId: true },
      })
    );
    assignedCondoIds = rows.map((r) => r.condominiumId);
  }
  return {
    role,
    companyId,
    personId: session.user.personId ?? null,
    assignedCondoIds,
    isBoardMember: session.user.isBoardMember ?? false,
  };
}

/**
 * Garantiza que una carpeta exista en el PROVEEDOR ACTIVO.
 *
 * Cuando se cambia de proveedor (local → Drive, Drive → S3…), las filas
 * de carpetas siguen apuntando al proveedor anterior. Esta función las
 * migra de forma perezosa y recursiva: primero el padre, después la
 * carpeta, creando en el proveedor activo (idempotente) y actualizando
 * la fila. Los ARCHIVOS no se tocan: cada objeto recuerda su proveedor
 * y se lee de ahí; solo las subidas nuevas usan el proveedor activo.
 */
async function syncFolderWithActiveProvider(
  companyId: string,
  folderId: string
): Promise<{ id: string; providerFolderId: string }> {
  const { kind, provider } = await providerForCompany(companyId);
  const row = await enEmpresa(companyId, (tx) =>
    tx.storageFolder.findUniqueOrThrow({ where: { id: folderId } })
  );
  if (row.provider === kind) return { id: row.id, providerFolderId: row.providerFolderId };

  // Las carpetas de plataforma ("ANEXYpro", "Condominios", "DEMOS") se
  // resuelven con ensureRoots, que ya es consciente del proveedor
  // (crea filas nuevas por proveedor). Se distinguen por `slug`, no por
  // `kind`: "Condominios", "DEMOS" y "Empresas" comparten el mismo
  // `kind: 'condominios'` (son el mismo TIPO de contenedor), así que
  // `kind` por sí solo ya no alcanza para saber cuál es cuál.
  if (row.slug === 'raiz' || row.slug === 'condominios' || row.slug === 'demos') {
    const roots = await ensureRoots(companyId);
    const id = row.slug === 'raiz' ? roots.rootId : row.slug === 'demos' ? roots.demosId : roots.condosId;
    const fresh = await enEmpresa(companyId, (tx) =>
      tx.storageFolder.findUniqueOrThrow({ where: { id } })
    );
    return { id: fresh.id, providerFolderId: fresh.providerFolderId };
  }

  const parent = row.parentId
    ? await syncFolderWithActiveProvider(companyId, row.parentId)
    : await (async () => {
        const roots = await ensureRoots(companyId);
        const fresh = await enEmpresa(companyId, (tx) =>
          tx.storageFolder.findUniqueOrThrow({ where: { id: roots.rootId } })
        );
        return { id: fresh.id, providerFolderId: fresh.providerFolderId };
      })();

  const made = await provider.createFolder(row.name, parent.providerFolderId);
  const updated = await enEmpresa(companyId, (tx) =>
    tx.storageFolder.update({
      where: { id: row.id },
      data: { provider: kind, providerFolderId: made.id, parentId: parent.id },
    })
  );
  return { id: updated.id, providerFolderId: updated.providerFolderId };
}

async function folderTarget(companyId: string, folderId: string) {
  const f = await enEmpresa(companyId, (tx) =>
    tx.storageFolder.findUniqueOrThrow({ where: { id: folderId } })
  );
  return {
    row: f,
    target: {
      companyId: f.companyId,
      condominiumId: f.condominiumId,
      personId: f.personId,
      kind: f.kind,
      slug: f.slug,
      allowedRoles: f.allowedRoles,
    },
  };
}

// ============================================================
// Operaciones sobre archivos
// ============================================================

export async function uploadToFolder(
  actor: Actor,
  input: {
    folderId: string;
    fileName: string;
    mimeType: string;
    data: Buffer;
    ownerPersonId?: string | null;
    userId?: string;
    userName?: string;
  }
): Promise<StoredFile> {
  const { row, target } = await folderTarget(actor.companyId, input.folderId);
  const decision = canWriteFolder(actor, target);
  if (!decision.allowed) throw new Error(decision.reason);

  if (input.data.length === 0) throw new Error('El archivo está vacío.');
  if (input.data.length > MAX_BYTES) {
    throw new Error(`El archivo supera el máximo de ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`);
  }

  const sha256 = crypto.createHash('sha256').update(input.data).digest('hex');
  const { kind, provider } = await providerForCompany(actor.companyId);

  // Duplicado exacto en la MISMA carpeta: se devuelve el que ya está en
  // vez de guardar dos veces los mismos bytes.
  const duplicate = await enEmpresa(actor.companyId, (tx) =>
    tx.storageObject.findFirst({
      where: { folderId: input.folderId, sha256, status: 'activo' },
    })
  );
  if (duplicate) {
    return {
      id: duplicate.id,
      name: duplicate.name,
      mimeType: duplicate.mimeType,
      sizeBytes: Number(duplicate.sizeBytes),
      sha256: duplicate.sha256,
      createdAt: duplicate.createdAt,
      updatedAt: duplicate.updatedAt,
      uploadedByName: null,
    };
  }

  // La carpeta puede venir de un proveedor anterior: se migra al activo
  // antes de subir (los archivos ya guardados no se mueven).
  const destino = await syncFolderWithActiveProvider(actor.companyId, input.folderId);

  const uploaded = await provider.uploadFile({
    name: input.fileName,
    mimeType: input.mimeType,
    parentId: destino.providerFolderId,
    data: input.data,
  });

  const object = await enEmpresa(actor.companyId, (tx) =>
    tx.storageObject.create({
      data: {
        companyId: row.companyId ?? actor.companyId,
        condominiumId: row.condominiumId,
        folderId: input.folderId,
        provider: kind,
        providerFileId: uploaded.id,
        name: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.data.length),
        sha256,
        ownerPersonId: input.ownerPersonId ?? row.personId ?? null,
        uploadedById: input.userId ?? null,
      },
    })
  );

  if (input.userId && row.companyId) {
    await withTenantContext(row.companyId, (tx) =>
      logActivity(tx, row.companyId!, {
          userId: input.userId!,
          userName: input.userName ?? 'Usuario',
          module: 'Documentos',
          action: 'Documento subido',
          target: `${row.name} · ${input.fileName}`,
        })
      ).catch(() => undefined);
    }

    return {
      id: object.id,
      name: object.name,
      mimeType: object.mimeType,
      sizeBytes: Number(object.sizeBytes),
      sha256: object.sha256,
      createdAt: object.createdAt,
      updatedAt: object.updatedAt,
      uploadedByName: null,
    };
  }

  /** Bytes del archivo. Solo la usa la ruta de descarga, tras validar. */
  export async function readObject(actor: Actor, objectId: string): Promise<{ name: string; mimeType: string; data: Buffer }> {
    const object = await enEmpresa(actor.companyId, (tx) =>
      tx.storageObject.findUniqueOrThrow({
      where: { id: objectId },
      include: { folder: true },
    })
    );
    if (object.status !== 'activo') throw new Error('El documento fue eliminado.');

    const decision = canReadObject(
      actor,
      {
        companyId: object.folder.companyId,
        condominiumId: object.folder.condominiumId,
        personId: object.folder.personId,
        kind: object.folder.kind,
        slug: object.folder.slug,
        allowedRoles: object.folder.allowedRoles,
      },
      { ownerPersonId: object.ownerPersonId }
    );
    if (!decision.allowed) throw new Error(decision.reason);

    // Se usa el proveedor con el que se guardó, no el activo: durante una
    // migración conviven archivos de dos proveedores.
    const { buildProvider } = await import('@/lib/storage');
    const settings = await getStorageSettings();
    const provider = buildProvider(object.provider as StorageKind, settings.config);

    return { name: object.name, mimeType: object.mimeType, data: await provider.downloadFile(object.providerFileId) };
  }

  export async function renameObject(actor: Actor, objectId: string, newName: string) {
    const object = await enEmpresa(actor.companyId, (tx) =>
      tx.storageObject.findUniqueOrThrow({
      where: { id: objectId },
      include: { folder: true },
    })
    );
    const decision = canWriteFolder(actor, {
      companyId: object.folder.companyId,
      condominiumId: object.folder.condominiumId,
      personId: object.folder.personId,
      kind: object.folder.kind,
      slug: object.folder.slug,
      allowedRoles: object.folder.allowedRoles,
    });
    if (!decision.allowed) throw new Error(decision.reason);
    if (newName.trim().length < 2) throw new Error('El nombre es muy corto.');

    // Con el proveedor del objeto: ahí viven los bytes.
    const { buildProvider: construir } = await import('@/lib/storage');
    const settings = await getStorageSettings();
    const provider = construir(object.provider as StorageKind, settings.config);
    await provider.renameFile(object.providerFileId, newName.trim()).catch(() => undefined);
    return enEmpresa(actor.companyId, (tx) =>
      tx.storageObject.update({ where: { id: objectId }, data: { name: newName.trim() } })
    );
  }

  export async function moveObject(actor: Actor, objectId: string, toFolderId: string) {
    const object = await enEmpresa(actor.companyId, (tx) =>
      tx.storageObject.findUniqueOrThrow({
      where: { id: objectId },
      include: { folder: true },
    })
    );
    const from = canWriteFolder(actor, {
      companyId: object.folder.companyId,
      condominiumId: object.folder.condominiumId,
      personId: object.folder.personId,
      kind: object.folder.kind,
      slug: object.folder.slug,
      allowedRoles: object.folder.allowedRoles,
    });
    if (!from.allowed) throw new Error(from.reason);

    const { row, target } = await folderTarget(actor.companyId, toFolderId);
    const to = canWriteFolder(actor, target);
    if (!to.allowed) throw new Error(to.reason);

    // Mover se hace con el proveedor DEL OBJETO (ahí viven los bytes),
    // hacia la carpeta tal como existe en ese mismo proveedor. Si la
    // carpeta destino ya migró a otro proveedor, no se puede mover
    // físicamente sin re-subir: se bloquea con un mensaje claro.
    if (object.provider !== row.provider) {
      throw new Error(
        'El archivo está guardado en un proveedor anterior y la carpeta destino ya vive en el nuevo. Descargalo y volvé a subirlo para moverlo.'
      );
    }
    const { buildProvider: construir } = await import('@/lib/storage');
    const settingsMove = await getStorageSettings();
    const provider = construir(object.provider as StorageKind, settingsMove.config);
    await provider.moveFile(object.providerFileId, row.providerFolderId);
    return enEmpresa(actor.companyId, (tx) =>
      tx.storageObject.update({
      where: { id: objectId },
      data: { folderId: toFolderId, ownerPersonId: row.personId ?? null },
    })
    );
  }

  export async function deleteObject(actor: Actor, objectId: string) {
    const object = await enEmpresa(actor.companyId, (tx) =>
      tx.storageObject.findUniqueOrThrow({
      where: { id: objectId },
      include: { folder: true },
    })
    );
    const decision = canDeleteObject(actor, {
      companyId: object.folder.companyId,
      condominiumId: object.folder.condominiumId,
      personId: object.folder.personId,
      kind: object.folder.kind,
      slug: object.folder.slug,
      allowedRoles: object.folder.allowedRoles,
    });
    if (!decision.allowed) throw new Error(decision.reason);

    // Con el proveedor del objeto: ahí viven los bytes.
    const { buildProvider: construir } = await import('@/lib/storage');
    const settings = await getStorageSettings();
    const provider = construir(object.provider as StorageKind, settings.config);
    await provider.deleteFile(object.providerFileId);
    // Baja lógica: el metadato queda para la auditoría.
    return enEmpresa(actor.companyId, (tx) =>
      tx.storageObject.update({
      where: { id: objectId },
      data: { status: 'eliminado', deletedAt: new Date() },
    })
    );
  }

  // ============================================================
  // Consulta
  // ============================================================

  /** Carpetas del condominio que el actor puede ver, en forma de árbol. */
  export async function listVisibleFolders(actor: Actor, condominiumId: string) {
    const folders = await enEmpresa(actor.companyId, (tx) =>
      tx.storageFolder.findMany({
      where: { condominiumId },
      orderBy: [{ slug: 'asc' }],
      include: { _count: { select: { objects: { where: { status: 'activo' } } } } },
    })
    );

    return folders
      .filter(
        (f) =>
          f.slug !== 'condominio' &&
          canReadFolder(actor, {
            companyId: f.companyId,
            condominiumId: f.condominiumId,
            personId: f.personId,
            kind: f.kind,
            slug: f.slug,
            allowedRoles: f.allowedRoles,
          }).allowed
      )
      .map((f) => ({
        id: f.id,
        name: f.name,
        slug: f.slug,
        kind: f.kind,
        depth: f.slug.split('/').length - 1,
        personId: f.personId,
        fileCount: f._count.objects,
        canWrite: canWriteFolder(actor, {
          companyId: f.companyId,
          condominiumId: f.condominiumId,
          personId: f.personId,
          kind: f.kind,
          slug: f.slug,
          allowedRoles: f.allowedRoles,
        }).allowed,
      }));
  }

  export async function listFolderObjects(actor: Actor, folderId: string) {
    const { target } = await folderTarget(actor.companyId, folderId);
    const decision = canReadFolder(actor, target);
    if (!decision.allowed) throw new Error(decision.reason);

    const rows = await enEmpresa(actor.companyId, (tx) =>
      tx.storageObject.findMany({
      where: { folderId, status: 'activo' },
      orderBy: { createdAt: 'desc' },
      include: { person: { select: { fullName: true } } },
    })
    );

    return rows.map((o) => ({
      id: o.id,
      name: o.name,
      mimeType: o.mimeType,
      sizeBytes: Number(o.sizeBytes),
      sha256: o.sha256,
      createdAt: o.createdAt,
      ownerName: o.person?.fullName ?? null,
    }));
  }

  /** Busca por nombre entre las carpetas que el actor puede ver. */
  export async function searchObjects(actor: Actor, condominiumId: string, query: string) {
    const visible = await listVisibleFolders(actor, condominiumId);
    const ids = visible.map((f) => f.id);
    if (ids.length === 0) return [];

    const rows = await enEmpresa(actor.companyId, (tx) =>
      tx.storageObject.findMany({
      where: { folderId: { in: ids }, status: 'activo', name: { contains: query, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: { folder: { select: { name: true, slug: true } } },
    })
    );

    return rows.map((o) => ({
      id: o.id,
      name: o.name,
      mimeType: o.mimeType,
      sizeBytes: Number(o.sizeBytes),
      createdAt: o.createdAt,
      folderName: o.folder.name,
      folderSlug: o.folder.slug,
    }));
  }

  /**
   * Espacio utilizado por un condominio: suma de los archivos activos
   * según los metadatos propios — no se le pregunta al proveedor, así
   * que funciona igual con Drive, S3 o el disco local.
   */
  export async function condoStorageUsage(actor: Actor, condominiumId: string) {
    const agg = await enEmpresa(actor.companyId, (tx) =>
      tx.storageObject.aggregate({
        where: { condominiumId, companyId: actor.companyId, status: 'activo' },
        _sum: { sizeBytes: true },
        _count: { _all: true },
      })
    );
    return { files: agg._count._all, bytes: Number(agg._sum.sizeBytes ?? 0) };
  }

  /**
   * Resumen para el panel del master: volumen por proveedor.
   *
   * Se suma empresa por empresa, con el contexto de cada una: no hay una
   * consulta que mire por encima del aislamiento, ni siquiera para
   * contar. Quedan fuera las tres carpetas contenedoras de la plataforma,
   * que no guardan archivos.
   */
  export async function storageStats() {
    const porEmpresa = await forEachCompany(async (tx, companyId) => {
      const [folders, objects, bytes, byProvider] = await Promise.all([
        tx.storageFolder.count({ where: { companyId } }),
        tx.storageObject.count({ where: { companyId, status: 'activo' } }),
        tx.storageObject.aggregate({ where: { companyId, status: 'activo' }, _sum: { sizeBytes: true } }),
        tx.storageObject.groupBy({
          by: ['provider'],
          where: { companyId, status: 'activo' },
          _count: { _all: true },
          _sum: { sizeBytes: true },
        }),
      ]);
      return { folders, objects, bytes: Number(bytes._sum.sizeBytes ?? 0), byProvider };
    });

    const acumulado = new Map<string, { files: number; bytes: number }>();
    for (const { result } of porEmpresa) {
      for (const p of result.byProvider) {
        const prev = acumulado.get(p.provider) ?? { files: 0, bytes: 0 };
        acumulado.set(p.provider, {
          files: prev.files + p._count._all,
          bytes: prev.bytes + Number(p._sum.sizeBytes ?? 0),
        });
      }
    }

    return {
      folders: porEmpresa.reduce((n, x) => n + x.result.folders, 0),
      objects: porEmpresa.reduce((n, x) => n + x.result.objects, 0),
      totalBytes: porEmpresa.reduce((n, x) => n + x.result.bytes, 0),
      byProvider: [...acumulado.entries()].map(([provider, v]) => ({
        provider: provider as StorageKind,
        files: v.files,
        bytes: v.bytes,
      })),
    };
  }
