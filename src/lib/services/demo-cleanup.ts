import { prisma, withTenantContext, forEachCompany } from '@/lib/db';
import { buildProvider, getStorageSettings } from '@/lib/storage';
import type { StorageKind, StorageProvider } from '@/lib/storage/provider';
import {
  evaluatePurgeEligibility,
  evaluateOwnership,
  isAlreadyPurged,
  isFolderReallyEmpty,
  orderFoldersDeepestFirst,
  summarizeCleanup,
  type CleanupItemResult,
} from '@/lib/domain/demo-cleanup';

/**
 * Eliminación FÍSICA de los archivos de Google Drive de una cuenta
 * DEMO (PASO 9) — inicio + 15 días de prueba + 3 días de gracia = día
 * 18 (`demoLifecycleDates`, `domain/demo-lifecycle.ts`).
 *
 * TODAVÍA NO SE DISPARA SOLO. A propósito: esta función no está
 * registrada en `jobs/index.ts`, así que el programador diario NUNCA
 * la llama. Se invoca a mano — desde `scripts/purgar-demo.ts` o desde
 * el botón "Purgar archivos" del panel master
 * (`/master/usuarios-demo`) — hasta que se decida activarla en
 * producción.
 *
 * REGLA DE FONDO: ante cualquier duda, NO SE BORRA. Toda la decisión
 * de "esto es seguro de eliminar" vive en funciones PURAS de
 * `domain/demo-cleanup.ts` (con sus propias pruebas); este archivo
 * solo hace la parte de I/O — leer la base con el aislamiento de
 * siempre (`withTenantContext`), hablar con el proveedor real, y
 * escribir el resultado — sin repetir ni una condición de negocio acá.
 *
 * IDENTIFICACIÓN — nunca por nombre:
 *  1. El tenant/demo id YA ES `Company.id` (no se inventa uno nuevo).
 *  2. La carpeta real sale de `Company.demoDriveFolderId` (id real de
 *     Drive, guardado por PASO 8 al crear el árbol).
 *  3. Se comprueba que esa fila de `StorageFolder` es de ESTA empresa
 *     y cuelga del contenedor "DEMOS" (nunca de "Condominios") — si
 *     algo no cuadra, se detiene sin borrar nada.
 *  4. El árbol completo (subcarpetas y archivos) se recorre por
 *     `parentId`/`folderId` reales dentro de la base, con Row-Level
 *     Security aplicado — una fila de otra empresa NO PUEDE aparecer
 *     acá, lo garantiza Postgres, no una condición en este archivo.
 *  5. Antes de cada borrado se vuelve a preguntar al PROVEEDOR (no
 *     solo a la base) de quién es realmente el recurso —
 *     `inspectOwnership` — y se compara además contra TODAS las demás
 *     empresas por si el mismo id de Drive quedó, por error,
 *     referenciado en otro lado.
 *
 * IDEMPOTENTE Y REINTENTABLE: cada elemento borrado (o ya inexistente)
 * se quita de la base al instante, así que reintentar tras una falla
 * parcial solo vuelve a intentar lo que de verdad sigue pendiente.
 */

export type PurgeActor = { userId: string | null; userName: string };

export type PurgeDemoOptions = {
  actor?: PurgeActor;
  /** Hora del SERVIDOR — nunca la del navegador. Por omisión, `new Date()`. */
  now?: Date;
  /** Salta la comprobación del día 18. Solo para pruebas manuales controladas. */
  force?: boolean;
};

export type PurgeDemoResult = {
  companyId: string;
  status: 'omitido' | 'ok' | 'fallido';
  summary: string;
  filesFound: number;
  filesDeleted: number;
  foldersFound: number;
  foldersDeleted: number;
  failed: CleanupItemResult[];
  startedAt: Date;
  endedAt: Date;
};

type FolderRow = {
  id: string;
  companyId: string | null;
  condominiumId: string | null;
  parentId: string | null;
  name: string;
  slug: string;
  provider: string;
  providerFolderId: string;
};

type ObjectRow = {
  id: string;
  folderId: string;
  provider: string;
  providerFileId: string;
  name: string;
};

/** Registra el intento en el historial de la demo — pase lo que pase, siempre queda auditado. */
async function anotarHistorial(companyId: string, event: string, detail: string, actorUserId: string | null) {
  await prisma.demoHistoryEntry.create({ data: { companyId, event, detail, actorUserId } }).catch(() => undefined);
}

async function anotarAuditoria(companyId: string, actor: PurgeActor | undefined, action: string, target: string) {
  await withTenantContext(companyId, (tx) =>
    tx.auditLog.create({
      data: {
        companyId,
        userId: actor?.userId ?? null,
        userName: actor ? `${actor.userName}` : 'Sistema (purga de demo)',
        module: 'Plataforma',
        action,
        target,
      },
    })
  ).catch(() => undefined);
}

/** Recorre el árbol completo por `parentId` real, empezando en la carpeta raíz de la demo. */
async function recolectarArbol(companyId: string, raiz: FolderRow): Promise<{ folders: FolderRow[]; objects: ObjectRow[] }> {
  const folders: FolderRow[] = [raiz];
  // Corte defensivo ante un ciclo corrupto en `parentId` (no debería
  // pasar nunca, pero sin esto un ciclo colgaría esta función en un
  // bucle infinito en vez de fallar ruidosamente — mismo caso que
  // `orderFoldersDeepestFirst` en domain/demo-cleanup.ts; auditoría de
  // seguridad 2026-08-11, hallazgo #17). Solo se sigue por carpetas
  // NUEVAS: si un "hijo" ya se recolectó antes, no se vuelve a seguir
  // — así el ciclo se corta en vez de repetirse para siempre.
  const vistos = new Set([raiz.id]);
  let frontier = [raiz.id];
  while (frontier.length) {
    const children = await withTenantContext(companyId, (tx) =>
      tx.storageFolder.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true, companyId: true, condominiumId: true, parentId: true, name: true, slug: true, provider: true, providerFolderId: true },
      })
    );
    const nuevos = children.filter((c) => !vistos.has(c.id));
    if (!nuevos.length) break;
    for (const c of nuevos) vistos.add(c.id);
    folders.push(...nuevos);
    frontier = nuevos.map((c) => c.id);
  }

  const folderIds = folders.map((f) => f.id);
  const objects = await withTenantContext(companyId, (tx) =>
    tx.storageObject.findMany({
      where: { folderId: { in: folderIds } },
      select: { id: true, folderId: true, provider: true, providerFileId: true, name: true },
    })
  );
  return { folders, objects };
}

/**
 * ¿El mismo id de Drive que se va a borrar aparece, en la fila de
 * OTRA empresa? Recorre cada empresa con su propio contexto (nunca se
 * apaga Row-Level Security para mirar por encima) — es la misma vía
 * que usa el resto de la plataforma para lo que legítimamente
 * atraviesa tenants (`forEachCompany`, `src/lib/db.ts`).
 *
 * Costo conocido: una consulta por empresa. Aceptable porque esto
 * corre una vez por demo purgada, no en un flujo interactivo — mismo
 * tipo de trade-off documentado que el de `demo-vencidos` en
 * `jobs/index.ts`.
 */
async function buscarColisionesEntreTenants(
  companyId: string,
  providerFolderIds: string[],
  providerFileIds: string[]
): Promise<{ companyId: string; folders: { providerFolderId: string; name: string }[]; objects: { providerFileId: string; name: string }[] }[]> {
  if (providerFolderIds.length === 0 && providerFileIds.length === 0) return [];

  const porEmpresa = await forEachCompany(async (tx, otherCompanyId) => {
    if (otherCompanyId === companyId) return { folders: [], objects: [] };
    const [folders, objects] = await Promise.all([
      providerFolderIds.length
        ? tx.storageFolder.findMany({ where: { providerFolderId: { in: providerFolderIds } }, select: { providerFolderId: true, name: true } })
        : Promise.resolve([] as { providerFolderId: string; name: string }[]),
      providerFileIds.length
        ? tx.storageObject.findMany({ where: { providerFileId: { in: providerFileIds } }, select: { providerFileId: true, name: true } })
        : Promise.resolve([] as { providerFileId: string; name: string }[]),
    ]);
    return { folders, objects };
  });

  return porEmpresa
    .filter((r) => r.result.folders.length > 0 || r.result.objects.length > 0)
    .map((r) => ({ companyId: r.companyId, ...r.result }));
}

/** Elimina físicamente los archivos de Drive de una cuenta DEMO y las filas que los describen. */
export async function purgeDemoDriveFiles(companyId: string, opts: PurgeDemoOptions = {}): Promise<PurgeDemoResult> {
  const startedAt = opts.now ?? new Date();
  const actorUserId = opts.actor?.userId ?? null;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      isDemo: true,
      demoStatus: true,
      demoDeleteScheduledAt: true,
      demoDriveFolderId: true,
    },
  });
  if (!company) throw new Error('Esa empresa no existe.');

  // Idempotencia: una demo ya purgada no vuelve a tocarse. No es un
  // error — reintentar sobre algo que ya terminó bien es justo lo que
  // pide "idempotente" en el enunciado.
  if (isAlreadyPurged(company.demoStatus)) {
    const endedAt = opts.now ?? new Date();
    await anotarHistorial(companyId, 'purga_omitida', 'Ya estaba eliminada — no había nada que hacer.', actorUserId);
    return {
      companyId,
      status: 'omitido',
      summary: 'Esta demo ya fue purgada anteriormente; no se tocó nada.',
      filesFound: 0,
      filesDeleted: 0,
      foldersFound: 0,
      foldersDeleted: 0,
      failed: [],
      startedAt,
      endedAt,
    };
  }

  // Elegibilidad (PASO 2 + PASO 9): demo, vencida o con limpieza
  // fallida previa, y ya pasó el día 18. Si no se cumple, se lanza sin
  // tocar nada y SIN anotar historial — es un error de quien llama
  // (mismo criterio que `reactivateDemo`/`convertDemoToFormal`).
  const elegibilidad = evaluatePurgeEligibility({
    isDemo: company.isDemo,
    demoStatus: company.demoStatus,
    demoDeleteScheduledAt: company.demoDeleteScheduledAt,
    now: startedAt,
    force: opts.force,
  });
  if (!elegibilidad.allowed) throw new Error(elegibilidad.reason);

  // PASO 11 — auditoría del ciclo de vida: "iniciar limpieza" es su
  // propio evento, separado de "completar"/"fallar", para que quede
  // registrado el INTENTO aunque todavía no se sepa cómo termina —
  // útil si el proceso se cae a mitad de camino sin llegar a escribir
  // ningún resultado final.
  await anotarHistorial(
    companyId,
    'limpieza_iniciada',
    `Purga de archivos iniciada${opts.actor ? ` por ${opts.actor.userName}` : ' por el sistema'} · ${startedAt.toISOString()}`,
    actorUserId
  );

  const marcarIncidente = async (motivo: string): Promise<PurgeDemoResult> => {
    const endedAt = new Date();
    await prisma.company.update({ where: { id: companyId }, data: { demoStatus: 'DEMO_CLEANUP_FAILED' } });
    await anotarHistorial(companyId, 'limpieza_fallida', motivo, actorUserId);
    await anotarAuditoria(companyId, opts.actor, 'Limpieza de archivos de la demo detenida', motivo.slice(0, 300));
    return {
      companyId,
      status: 'fallido',
      summary: motivo,
      filesFound: 0,
      filesDeleted: 0,
      foldersFound: 0,
      foldersDeleted: 0,
      failed: [],
      startedAt,
      endedAt,
    };
  };

  // ---------- Sin carpeta: ¿nunca hubo nada, o dato inconsistente? ----------
  if (!company.demoDriveFolderId) {
    const huerfana = await withTenantContext(companyId, (tx) =>
      tx.storageFolder.findFirst({ where: { companyId, slug: 'condominio' }, select: { id: true } })
    );
    if (huerfana) {
      // Hay una carpeta real en la base pero `Company.demoDriveFolderId`
      // no la refleja: no se puede identificar con seguridad cuál es
      // la carpeta de Drive de esta demo — se detiene, no se inventa.
      return marcarIncidente(
        'Existe una carpeta de almacenamiento para esta demo en la base, pero Company.demoDriveFolderId está vacío: ' +
          'no se puede identificar con seguridad la carpeta real de Drive. Se detuvo sin borrar nada.'
      );
    }
    // Nunca llegó a crear su árbol de carpetas (p. ej. una demo cuya
    // creación falló antes de PASO 8): no hay nada que purgar.
    const endedAt = new Date();
    await prisma.company.update({ where: { id: companyId }, data: { demoStatus: 'DEMO_ELIMINADO', demoDeletedAt: endedAt } });
    await anotarHistorial(
      companyId,
      'eliminada',
      'Sin archivos que purgar — esta demo nunca llegó a crear su carpeta de almacenamiento.',
      actorUserId
    );
    return {
      companyId,
      status: 'ok',
      summary: 'Sin archivos que purgar — esta demo nunca llegó a crear su carpeta de almacenamiento.',
      filesFound: 0,
      filesDeleted: 0,
      foldersFound: 0,
      foldersDeleted: 0,
      failed: [],
      startedAt,
      endedAt,
    };
  }

  // ---------- Identificar la carpeta real y comprobar su exclusividad ----------
  const raiz = await withTenantContext(companyId, (tx) =>
    tx.storageFolder.findFirst({
      where: { companyId, slug: 'condominio', providerFolderId: company.demoDriveFolderId! },
      select: { id: true, companyId: true, condominiumId: true, parentId: true, name: true, slug: true, provider: true, providerFolderId: true },
    })
  );
  if (!raiz) {
    return marcarIncidente(
      `Company.demoDriveFolderId (${company.demoDriveFolderId}) no coincide con ninguna carpeta registrada de esta empresa. ` +
        'Se detuvo sin borrar nada: no se puede identificar la carpeta con seguridad.'
    );
  }

  const padreDeRaiz = raiz.parentId
    ? await withTenantContext(companyId, (tx) =>
        tx.storageFolder.findUnique({ where: { id: raiz.parentId! }, select: { id: true, slug: true, providerFolderId: true } })
      )
    : null;
  if (!padreDeRaiz || padreDeRaiz.slug !== 'demos') {
    // Nunca debe colgar de "Condominios" (clientes reales) ni de
    // ningún otro contenedor: solo de "DEMOS". Si no cuelga de ahí,
    // algo está mal clasificado — se detiene.
    return marcarIncidente(
      `La carpeta de esta demo no cuelga del contenedor "DEMOS" (cuelga de "${padreDeRaiz?.slug ?? 'nada'}"). ` +
        'Se detuvo sin borrar nada: no se puede confirmar que sea exclusiva de una cuenta DEMO.'
    );
  }

  // ---------- Recolectar TODO el árbol real (subcarpetas y archivos) ----------
  const { folders, objects } = await recolectarArbol(companyId, raiz);
  const foldersById = new Map(folders.map((f) => [f.id, f]));

  // ---------- Comprobar que nada del árbol está referenciado por otra empresa ----------
  const colisiones = await buscarColisionesEntreTenants(
    companyId,
    folders.map((f) => f.providerFolderId),
    objects.map((o) => o.providerFileId)
  );
  if (colisiones.length > 0) {
    const detalle = colisiones
      .map((c) => `empresa ${c.companyId}: ${c.folders.length} carpeta(s), ${c.objects.length} archivo(s)`)
      .join(' · ');
    return marcarIncidente(
      `Se encontraron ${colisiones.length} empresa(s) con filas que referencian los MISMOS ids de Drive que esta demo (${detalle}). ` +
        'Es una señal de un dato corrupto o compartido: se detuvo SIN BORRAR NADA para revisión manual.'
    );
  }

  // ---------- Borrar archivos ----------
  const providerCache = new Map<string, StorageProvider>();
  const settings = await getStorageSettings();
  const providerFor = (kind: string): StorageProvider => {
    if (!providerCache.has(kind)) providerCache.set(kind, buildProvider(kind as StorageKind, settings.config));
    return providerCache.get(kind)!;
  };

  const resultados: CleanupItemResult[] = [];

  for (const obj of objects) {
    const carpeta = foldersById.get(obj.folderId);
    if (!carpeta) {
      // No debería pasar nunca (el objeto salió de recolectarArbol,
      // que solo trae objetos de carpetas ya recolectadas) — pero si
      // pasa, no se borra un archivo sin saber a qué carpeta responde.
      resultados.push({
        kind: 'archivo',
        id: obj.id,
        providerId: obj.providerFileId,
        name: obj.name,
        outcome: 'error',
        motivo: 'No se encontró la carpeta contenedora en el árbol recolectado.',
      });
      continue;
    }

    const provider = providerFor(obj.provider);
    try {
      const facts = await provider.inspectOwnership(obj.providerFileId);
      const decision = evaluateOwnership(facts, carpeta.providerFolderId);

      if (decision.action === 'omitir') {
        resultados.push({ kind: 'archivo', id: obj.id, providerId: obj.providerFileId, name: obj.name, outcome: 'omitido', motivo: decision.motivo });
        continue;
      }
      if (decision.action === 'ya_no_existía') {
        await withTenantContext(companyId, (tx) => tx.storageObject.delete({ where: { id: obj.id } })).catch(() => undefined);
        resultados.push({ kind: 'archivo', id: obj.id, providerId: obj.providerFileId, name: obj.name, outcome: 'ya_no_existía' });
        continue;
      }

      await provider.deleteFilePermanently(obj.providerFileId);
      await withTenantContext(companyId, (tx) => tx.storageObject.delete({ where: { id: obj.id } }));
      resultados.push({ kind: 'archivo', id: obj.id, providerId: obj.providerFileId, name: obj.name, outcome: 'eliminado' });
    } catch (e: any) {
      resultados.push({ kind: 'archivo', id: obj.id, providerId: obj.providerFileId, name: obj.name, outcome: 'error', motivo: e?.message ?? 'Error desconocido.' });
    }
  }

  // ---------- Borrar carpetas: hojas primero, la raíz de la demo al final ----------
  const ordenCarpetas = orderFoldersDeepestFirst(folders);
  for (const carpeta of ordenCarpetas) {
    const padre = carpeta.id === raiz.id ? padreDeRaiz : (carpeta.parentId ? foldersById.get(carpeta.parentId) : null);
    if (!padre) {
      resultados.push({
        kind: 'carpeta',
        id: carpeta.id,
        providerId: carpeta.providerFolderId,
        name: carpeta.name,
        outcome: 'error',
        motivo: 'No se encontró la carpeta padre esperada.',
      });
      continue;
    }

    const provider = providerFor(carpeta.provider);
    try {
      const facts = await provider.inspectOwnership(carpeta.providerFolderId);
      const decision = evaluateOwnership(facts, padre.providerFolderId);

      if (decision.action === 'omitir') {
        resultados.push({ kind: 'carpeta', id: carpeta.id, providerId: carpeta.providerFolderId, name: carpeta.name, outcome: 'omitido', motivo: decision.motivo });
        continue;
      }
      if (decision.action === 'ya_no_existía') {
        await withTenantContext(companyId, (tx) => tx.storageFolder.delete({ where: { id: carpeta.id } })).catch(() => undefined);
        resultados.push({ kind: 'carpeta', id: carpeta.id, providerId: carpeta.providerFolderId, name: carpeta.name, outcome: 'ya_no_existía' });
        continue;
      }

      // Última comprobación EN VIVO, contra el proveedor: si queda
      // algo adentro que este recorrido no identificó (huérfano no
      // registrado en la base), NO se borra la carpeta en cascada.
      const vivo = await provider.listChildren(carpeta.providerFolderId);
      if (!isFolderReallyEmpty(vivo)) {
        resultados.push({
          kind: 'carpeta',
          id: carpeta.id,
          providerId: carpeta.providerFolderId,
          name: carpeta.name,
          outcome: 'omitido',
          motivo: `El proveedor todavía reporta contenido sin identificar adentro: ${vivo.folders.length} carpeta(s), ${vivo.files.length} archivo(s).`,
        });
        continue;
      }

      await provider.deleteFolderPermanently(carpeta.providerFolderId);
      await withTenantContext(companyId, (tx) => tx.storageFolder.delete({ where: { id: carpeta.id } }));
      resultados.push({ kind: 'carpeta', id: carpeta.id, providerId: carpeta.providerFolderId, name: carpeta.name, outcome: 'eliminado' });
    } catch (e: any) {
      resultados.push({ kind: 'carpeta', id: carpeta.id, providerId: carpeta.providerFolderId, name: carpeta.name, outcome: 'error', motivo: e?.message ?? 'Error desconocido.' });
    }
  }

  const resumen = summarizeCleanup(resultados);
  const endedAt = new Date();

  // PASO 11 — "eliminar archivos" como evento propio, separado de
  // "completar limpieza": documenta el ACTO físico de borrar (cuántos
  // archivos y carpetas se borraron de verdad en ESTA corrida) aparte
  // de si el resultado GLOBAL terminó limpio o con fallos pendientes.
  // Solo se anota si de verdad se borró algo en esta corrida — si todo
  // ya estaba borrado de un intento anterior (puro "ya_no_existía") o
  // no había nada que hacer, no hay un acto de borrado que registrar.
  const borradosEnEstaCorrida = resultados.filter((r) => r.outcome === 'eliminado');
  if (borradosEnEstaCorrida.length > 0) {
    const archivosBorrados = borradosEnEstaCorrida.filter((r) => r.kind === 'archivo').length;
    const carpetasBorradas = borradosEnEstaCorrida.filter((r) => r.kind === 'carpeta').length;
    await anotarHistorial(
      companyId,
      'archivos_eliminados',
      `${archivosBorrados} archivo(s) y ${carpetasBorradas} carpeta(s) eliminados físicamente del proveedor en esta corrida.`,
      actorUserId
    );
  }

  const detalle =
    `${resumen.filesFound} archivo(s) encontrado(s), ${resumen.filesDeleted} eliminado(s) · ` +
    `${resumen.foldersFound} carpeta(s) encontrada(s), ${resumen.foldersDeleted} eliminada(s) · ` +
    `${resumen.failed.length} fallo(s)` +
    (resumen.failed.length ? ': ' + resumen.failed.map((f) => `${f.name} (${f.motivo ?? 'error'})`).join('; ').slice(0, 800) : '') +
    ` · corrida ${startedAt.toISOString()}–${endedAt.toISOString()}`;

  if (resumen.finalStatus === 'DEMO_ELIMINADO') {
    await prisma.company.update({ where: { id: companyId }, data: { demoStatus: 'DEMO_ELIMINADO', demoDeletedAt: endedAt } });
    await anotarHistorial(companyId, 'eliminada', detalle, actorUserId);
    await anotarAuditoria(companyId, opts.actor, 'Archivos de Drive de la demo eliminados físicamente', detalle.slice(0, 300));
  } else {
    await prisma.company.update({ where: { id: companyId }, data: { demoStatus: 'DEMO_CLEANUP_FAILED' } });
    await anotarHistorial(companyId, 'limpieza_fallida', detalle, actorUserId);
    await anotarAuditoria(companyId, opts.actor, 'Limpieza de archivos de la demo terminó con fallos', detalle.slice(0, 300));
  }

  return {
    companyId,
    status: resumen.finalStatus === 'DEMO_ELIMINADO' ? 'ok' : 'fallido',
    summary: detalle,
    filesFound: resumen.filesFound,
    filesDeleted: resumen.filesDeleted,
    foldersFound: resumen.foldersFound,
    foldersDeleted: resumen.foldersDeleted,
    failed: resumen.failed,
    startedAt,
    endedAt,
  };
}
