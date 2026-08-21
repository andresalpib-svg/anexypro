import { withTenantContext, prisma } from '@/lib/db';
import { logActivity } from '@/lib/services/audit';
import {
  decideNextAction,
  applyAction,
  renderTemplate,
  type ViolationPolicy,
  type CaseState,
  type NextAction,
} from '@/lib/domain/violations';
import { buildViolationNoticePdf, money, type EvidenceImage } from '@/lib/pdf/violation-notice';
import { objectIdFromRef, refFromObjectId } from '@/lib/services/file-refs';
import { actorFromSession, folderBySlug, readObject, uploadToFolder } from '@/lib/services/storage';
import { addManualCharge } from '@/lib/services/finance';
import { isEmailConfigured, sendEmail, appUrl } from '@/lib/email';
import { escapeHtml as e } from '@/lib/html-escape';
import path from 'node:path';

/**
 * Gestión de Incumplimientos — orquestación.
 *
 * El motor de decisión vive en `domain/violations.ts` y no toca la
 * base. Este servicio es el que va y viene: lee el expediente, le
 * pregunta al motor qué corresponde, arma el documento, lo guarda en el
 * repositorio, manda el correo y —si toca multa— crea la cuenta por
 * cobrar.
 *
 * Una emisión no se deshace: por eso el orden importa. Primero se
 * escribe el expediente y la acción (transacción), y solo después se
 * intenta el correo. Si el correo falla, la notificación existe igual y
 * queda registrado que no salió; al revés se perdería la constancia de
 * una gestión que sí se hizo.
 */

// ============================================================
// Catálogo
// ============================================================

export type ViolationTypeInput = {
  name: string;
  description?: string;
  regulationArticle?: string;
  warningsRequired: number;
  daysBetween: number;
  fineAmount: number;
  immediateFine: boolean;
  warningTemplate?: string;
  secondWarningTemplate?: string;
  fineTemplate?: string;
  icon?: string;
  sortOrder?: number;
  isActive?: boolean;
};

export async function listViolationTypes(companyId: string, condominiumId: string, soloActivos = false) {
  return withTenantContext(companyId, (tx) =>
    tx.violationType.findMany({
      where: { condominiumId, ...(soloActivos ? { isActive: true } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  );
}

export async function createViolationType(companyId: string, condominiumId: string, input: ViolationTypeInput) {
  return withTenantContext(companyId, (tx) =>
    tx.violationType.create({ data: { condominiumId, ...normalizeType(input) } })
  );
}

export async function updateViolationType(companyId: string, typeId: string, input: ViolationTypeInput) {
  return withTenantContext(companyId, async (tx) => {
    await assertTypeInCompany(tx, typeId, companyId);
    return tx.violationType.update({ where: { id: typeId }, data: normalizeType(input) });
  });
}

export async function deleteViolationType(companyId: string, typeId: string) {
  return withTenantContext(companyId, async (tx) => {
    await assertTypeInCompany(tx, typeId, companyId);
    const casos = await tx.violationCase.count({ where: { violationTypeId: typeId } });
    if (casos > 0) {
      throw new Error(
        `Este tipo tiene ${casos} expediente(s) y borrarlo perdería ese historial. Desactívalo en su lugar.`
      );
    }
    return tx.violationType.delete({ where: { id: typeId } });
  });
}

function normalizeType(input: ViolationTypeInput) {
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    regulationArticle: input.regulationArticle?.trim() || null,
    warningsRequired: Math.max(0, Math.floor(input.warningsRequired)),
    daysBetween: Math.max(0, Math.floor(input.daysBetween)),
    fineAmount: input.fineAmount,
    immediateFine: input.immediateFine,
    warningTemplate: input.warningTemplate?.trim() || null,
    secondWarningTemplate: input.secondWarningTemplate?.trim() || null,
    fineTemplate: input.fineTemplate?.trim() || null,
    icon: input.icon || null,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
  };
}

/** Un identificador de otra empresa no debe resolver nada. */
async function assertTypeInCompany(tx: any, typeId: string, companyId: string) {
  const t = await tx.violationType.findFirst({
    where: { id: typeId, condominium: { companyId } },
    select: { id: true },
  });
  if (!t) throw new Error('El tipo de incumplimiento no existe.');
}

// ============================================================
// Ajustes del documento
// ============================================================

export type ViolationSettingsInput = {
  logoUrl?: string;
  primaryColor?: string;
  headerText?: string;
  footerText?: string;
  adminName?: string;
  adminDetails?: string;
  signerName?: string;
  signerTitle?: string;
  responseDays?: number;
};

export async function getViolationSettings(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.violationSettings.findUnique({ where: { condominiumId } })
  );
}

export async function saveViolationSettings(
  companyId: string,
  condominiumId: string,
  input: ViolationSettingsInput
) {
  const data = {
    logoUrl: input.logoUrl || undefined,
    primaryColor: input.primaryColor?.trim() || '#3B6EF5',
    headerText: input.headerText?.trim() || null,
    footerText: input.footerText?.trim() || null,
    adminName: input.adminName?.trim() || null,
    adminDetails: input.adminDetails?.trim() || null,
    signerName: input.signerName?.trim() || null,
    signerTitle: input.signerTitle?.trim() || null,
    responseDays: Math.max(1, Math.floor(input.responseDays ?? 8)),
  };
  return withTenantContext(companyId, (tx) =>
    tx.violationSettings.upsert({
      where: { condominiumId },
      create: { condominiumId, ...data, logoUrl: input.logoUrl || null },
      update: data,
    })
  );
}

// ============================================================
// Paso 1 — buscar la filial
// ============================================================

export type PropertyHit = {
  propertyId: string;
  code: string;
  condominiumId: string;
  condominiumName: string;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerPersonId: string | null;
  floor: number | null;
};

/**
 * Buscador del paso 1: número de filial, nombre del propietario,
 * número de casa o torre. Todo en un solo campo — obligar a elegir
 * "por cuál campo busco" es justo el tipo de fricción que este módulo
 * existe para quitar.
 */
/**
 * Persona propietaria de la filial (mismo criterio que usa la emisión:
 * miembro vigente, propietario primero). Sirve para marcarla como
 * destinataria de los archivos del expediente y que pueda abrirlos
 * desde el portal.
 */
export async function propertyOwnerPersonId(companyId: string, propertyId: string): Promise<string | null> {
  const member = await withTenantContext(companyId, (tx) =>
    tx.propertyMember.findFirst({
      where: { propertyId, endDate: null },
      orderBy: { role: 'asc' },
      select: { personId: true },
    })
  );
  return member?.personId ?? null;
}

export async function searchProperties(
  companyId: string,
  condominiumId: string,
  query: string
): Promise<PropertyHit[]> {
  const q = query.trim();
  if (q.length < 1) return [];

  return withTenantContext(companyId, async (tx) => {
    const props = await tx.property.findMany({
      where: {
        condominiumId,
        OR: [
          { code: { contains: q, mode: 'insensitive' } },
          { structuralUnit: { name: { contains: q, mode: 'insensitive' } } },
          {
            members: {
              some: { endDate: null, person: { fullName: { contains: q, mode: 'insensitive' } } },
            },
          },
        ],
      },
      select: {
        id: true,
        code: true,
        floor: true,
        condominiumId: true,
        condominium: { select: { name: true } },
        members: {
          where: { endDate: null },
          orderBy: { role: 'asc' },
          take: 1,
          select: { person: { select: { id: true, fullName: true, email: true } } },
        },
      },
      orderBy: { code: 'asc' },
      take: 25,
    });

    return props.map((p) => ({
      propertyId: p.id,
      code: p.code,
      condominiumId: p.condominiumId,
      condominiumName: p.condominium.name,
      ownerName: p.members[0]?.person.fullName ?? null,
      ownerEmail: p.members[0]?.person.email ?? null,
      ownerPersonId: p.members[0]?.person.id ?? null,
      floor: p.floor,
    }));
  });
}

// ============================================================
// Reincidencias — qué corresponde para esta filial y este tipo
// ============================================================

export type PropertyBriefing = {
  property: PropertyHit;
  /** Un renglón por tipo de incumplimiento con expediente abierto. */
  openCases: {
    caseId: string;
    caseNumber: string;
    typeId: string;
    typeName: string;
    warningsIssued: number;
    fineIssued: boolean;
    lastActionAt: Date | null;
  }[];
  totalCases: number;
  totalWarnings: number;
  totalFines: number;
};

export async function getPropertyBriefing(
  companyId: string,
  propertyId: string
): Promise<PropertyBriefing | null> {
  return withTenantContext(companyId, async (tx) => {
    const p = await tx.property.findFirst({
      where: { id: propertyId, condominium: { companyId } },
      select: {
        id: true,
        code: true,
        floor: true,
        condominiumId: true,
        condominium: { select: { name: true } },
        members: {
          where: { endDate: null },
          orderBy: { role: 'asc' },
          take: 1,
          select: { person: { select: { id: true, fullName: true, email: true } } },
        },
      },
    });
    if (!p) return null;

    const casos = await tx.violationCase.findMany({
      where: { propertyId },
      include: { violationType: { select: { id: true, name: true } } },
      orderBy: { openedAt: 'desc' },
    });

    return {
      property: {
        propertyId: p.id,
        code: p.code,
        condominiumId: p.condominiumId,
        condominiumName: p.condominium.name,
        ownerName: p.members[0]?.person.fullName ?? null,
        ownerEmail: p.members[0]?.person.email ?? null,
        ownerPersonId: p.members[0]?.person.id ?? null,
        floor: p.floor,
      },
      openCases: casos
        .filter((c) => c.status === 'abierto')
        .map((c) => ({
          caseId: c.id,
          caseNumber: c.caseNumber,
          typeId: c.violationType.id,
          typeName: c.violationType.name,
          warningsIssued: c.warningsIssued,
          fineIssued: c.fineIssued,
          lastActionAt: c.lastActionAt,
        })),
      totalCases: casos.length,
      totalWarnings: casos.reduce((n, c) => n + c.warningsIssued, 0),
      totalFines: casos.filter((c) => c.fineIssued).length,
    };
  });
}

/**
 * Qué pasaría si se reporta este tipo para esta filial — sin escribir
 * nada. La pantalla lo usa para avisar antes de que el usuario
 * confirme: "ya recibió la primera notificación, corresponde la
 * segunda".
 */
export async function previewNextAction(
  companyId: string,
  propertyId: string,
  violationTypeId: string,
  now = new Date()
): Promise<{ action: NextAction; existingCase: { id: string; caseNumber: string } | null; typeName: string }> {
  return withTenantContext(companyId, async (tx) => {
    const tipo = await tx.violationType.findFirstOrThrow({
      where: { id: violationTypeId, condominium: { companyId } },
    });
    const abierto = await tx.violationCase.findFirst({
      where: { propertyId, violationTypeId, status: 'abierto' },
      orderBy: { openedAt: 'desc' },
    });

    const policy = toPolicy(tipo);
    const state: CaseState | null = abierto
      ? {
          warningsIssued: abierto.warningsIssued,
          fineIssued: abierto.fineIssued,
          lastActionAt: abierto.lastActionAt,
        }
      : null;

    return {
      action: decideNextAction(policy, state, now),
      existingCase: abierto ? { id: abierto.id, caseNumber: abierto.caseNumber } : null,
      typeName: tipo.name,
    };
  });
}

function toPolicy(t: {
  warningsRequired: number;
  daysBetween: number;
  fineAmount: unknown;
  immediateFine: boolean;
}): ViolationPolicy {
  return {
    warningsRequired: t.warningsRequired,
    daysBetween: t.daysBetween,
    fineAmount: Number(t.fineAmount),
    immediateFine: t.immediateFine,
  };
}

// ============================================================
// Paso 3 — emitir
// ============================================================

const TEXTO_ADVERTENCIA_POR_DEFECTO =
  'Estimado(a) {propietario}:\n\n' +
  'Por este medio la Administración del condominio {condominio} le notifica que se ha registrado un incumplimiento del reglamento en la filial {filial}, correspondiente a: {incumplimiento}.\n\n' +
  'El hecho fue constatado el {fecha} a las {hora}. {articulo}\n\n' +
  '{consecuencia}\n\n' +
  'Le solicitamos atender esta situación dentro del plazo de {plazo} días hábiles.';

/**
 * Segunda notificación en adelante.
 *
 * Tiene que recordar cuándo se envió la anterior y decir qué pasa si
 * el incumplimiento se repite: una advertencia que no advierte de la
 * consecuencia no sirve como antecedente si el caso escala.
 */
const TEXTO_SEGUNDA_POR_DEFECTO =
  'Estimado(a) {propietario}:\n\n' +
  'La Administración del condominio {condominio} le notifica un nuevo incumplimiento del reglamento en la filial {filial}, correspondiente a: {incumplimiento}.\n\n' +
  'El hecho fue constatado el {fecha} a las {hora}. {articulo}\n\n' +
  'Consta que el {fechaPrimera} a las {horaPrimera} se le remitió la primera notificación por este mismo incumplimiento, sin que la situación haya sido corregida.\n\n' +
  '{consecuencia}\n\n' +
  'Le solicitamos atender esta situación dentro del plazo de {plazo} días hábiles.';

const TEXTO_MULTA_POR_DEFECTO =
  'Estimado(a) {propietario}:\n\n' +
  'La Administración del condominio {condominio} le comunica que, habiéndose agotado las advertencias previstas, se resuelve aplicar una multa a la filial {filial} por el incumplimiento: {incumplimiento}.\n\n' +
  'La resolución se emite el {fecha} a las {hora}. {articulo}\n\n' +
  'El monto será incorporado a su estado de cuenta.';

export type IssueInput = {
  condominiumId: string;
  propertyId: string;
  violationTypeId: string;
  observation?: string;
  /** Evidencias ya subidas al repositorio: referencias /api/archivo/<id>. */
  evidences: { fileRef: string; fileName: string; mimeType: string; kind: 'imagen' | 'video'; sizeBytes: number }[];
};

export type IssueResult = {
  caseId: string;
  caseNumber: string;
  actionId: string;
  kind: 'advertencia' | 'multa';
  sequence: number;
  documentRef: string | null;
  emailStatus: string;
  chargeId: string | null;
  fineAmount: number | null;
};

export async function issueViolation(
  session: {
    user: { id: string; companyId: string; name?: string | null; email?: string | null; role: string };
  },
  input: IssueInput
): Promise<IssueResult> {
  const companyId = session.user.companyId;
  const actorName = session.user.name ?? session.user.email ?? 'Usuario';
  const now = new Date();

  // ---- 1. Leer todo lo necesario y decidir qué corresponde ----
  const contexto = await withTenantContext(companyId, async (tx) => {
    const tipo = await tx.violationType.findFirstOrThrow({
      where: { id: input.violationTypeId, condominiumId: input.condominiumId, condominium: { companyId } },
    });
    if (!tipo.isActive) throw new Error('Ese tipo de incumplimiento está desactivado.');

    const property = await tx.property.findFirstOrThrow({
      where: { id: input.propertyId, condominiumId: input.condominiumId },
      select: {
        id: true,
        code: true,
        condominium: { select: { id: true, name: true, currency: true } },
        members: {
          where: { endDate: null },
          orderBy: { role: 'asc' },
          take: 1,
          select: { person: { select: { id: true, fullName: true, email: true } } },
        },
      },
    });

    const abierto = await tx.violationCase.findFirst({
      where: { propertyId: input.propertyId, violationTypeId: input.violationTypeId, status: 'abierto' },
      orderBy: { openedAt: 'desc' },
    });

    const settings = await tx.violationSettings.findUnique({
      where: { condominiumId: input.condominiumId },
    });

    const emitidosEsteAnio = await tx.violationCase.count({
      where: { condominiumId: input.condominiumId },
    });

    return { tipo, property, abierto, settings, emitidosEsteAnio };
  });

  const { tipo, property, abierto, settings } = contexto;
  const policy = toPolicy(tipo);
  const state: CaseState | null = abierto
    ? { warningsIssued: abierto.warningsIssued, fineIssued: abierto.fineIssued, lastActionAt: abierto.lastActionAt }
    : null;

  const decision = decideNextAction(policy, state, now);
  if (decision.kind === 'ninguna') {
    throw new Error(decision.reason);
  }
  const siguiente = applyAction(policy, state, decision, now);

  const owner = property.members[0]?.person ?? null;
  const caseNumber =
    abierto?.caseNumber ??
    `INC-${now.getFullYear()}-${String(contexto.emitidosEsteAnio + 1).padStart(4, '0')}`;

  // ---- 2. Texto del documento ----
  // Tres formatos distintos: primera notificación, segunda en
  // adelante, y resolución de multa.
  const esSegundaOMas = decision.kind === 'advertencia' && decision.sequence > 1;
  const plantilla =
    decision.kind === 'multa'
      ? tipo.fineTemplate || TEXTO_MULTA_POR_DEFECTO
      : esSegundaOMas
        ? tipo.secondWarningTemplate || TEXTO_SEGUNDA_POR_DEFECTO
        : tipo.warningTemplate || TEXTO_ADVERTENCIA_POR_DEFECTO;

  // Datos de la PRIMERA notificación de este expediente, para poder
  // citarla. Se leen solo cuando hacen falta.
  let fechaPrimera = '';
  let horaPrimera = '';
  if (esSegundaOMas && abierto) {
    const primera = await withTenantContext(companyId, (tx) =>
      tx.violationAction.findFirst({
        where: { caseId: abierto.id, kind: 'advertencia' },
        orderBy: { issuedAt: 'asc' },
        select: { issuedAt: true },
      })
    );
    if (primera) {
      fechaPrimera = primera.issuedAt.toLocaleDateString('es-CR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'America/Costa_Rica',
      });
      horaPrimera = primera.issuedAt.toLocaleTimeString('es-CR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Costa_Rica',
      });
    }
  }

  // Qué pasa si vuelve a incumplir: sale de la configuración, no de un
  // texto fijo, porque cada tipo tiene su propio escalamiento.
  const advertenciasRestantes = tipo.warningsRequired - (decision.kind === 'advertencia' ? decision.sequence : 0);
  const consecuencia =
    decision.kind === 'multa'
      ? ''
      : advertenciasRestantes <= 0
        ? `De reincidir en este incumplimiento se procederá a aplicar la multa correspondiente, por un monto de ${money(Number(tipo.fineAmount), property.condominium.currency)}, conforme al reglamento del condominio.`
        : `De reincidir en este incumplimiento se emitirá la notificación siguiente y, agotadas las ${tipo.warningsRequired} advertencias previstas, se procederá a aplicar la multa correspondiente por un monto de ${money(Number(tipo.fineAmount), property.condominium.currency)}.`;

  const responseDays = settings?.responseDays ?? 8;
  const bodyText = renderTemplate(plantilla, {
    propietario: owner?.fullName ?? 'Propietario',
    filial: property.code,
    condominio: property.condominium.name,
    fecha: now.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Costa_Rica' }),
    hora: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Costa_Rica' }),
    supervisor: actorName,
    administrador: settings?.adminName ?? '',
    articulo: tipo.regulationArticle ? `Referencia: ${tipo.regulationArticle}.` : '',
    incumplimiento: tipo.name,
    observacion: input.observation ?? '',
    monto: decision.kind === 'multa' ? money(Number(tipo.fineAmount), property.condominium.currency) : '',
    consecutivo: caseNumber,
    plazo: String(responseDays),
    fechaPrimera,
    horaPrimera,
    consecuencia,
  });

  // ---- 3. Expediente y acción (una transacción) ----
  const escritura = await withTenantContext(companyId, async (tx) => {
    const expediente = abierto
      ? await tx.violationCase.update({
          where: { id: abierto.id },
          data: {
            warningsIssued: siguiente.warningsIssued,
            fineIssued: siguiente.fineIssued,
            status: siguiente.status,
            lastActionAt: siguiente.lastActionAt,
            nextActionDueAt: siguiente.nextActionDueAt,
            closedAt: siguiente.status === 'cerrado' ? now : null,
          },
        })
      : await tx.violationCase.create({
          data: {
            condominiumId: input.condominiumId,
            propertyId: input.propertyId,
            violationTypeId: input.violationTypeId,
            personId: owner?.id ?? null,
            caseNumber,
            status: siguiente.status,
            warningsIssued: siguiente.warningsIssued,
            fineIssued: siguiente.fineIssued,
            openedAt: now,
            lastActionAt: siguiente.lastActionAt,
            nextActionDueAt: siguiente.nextActionDueAt,
            closedAt: siguiente.status === 'cerrado' ? now : null,
            createdById: session.user.id,
            createdByName: actorName,
          },
        });

    const accion = await tx.violationAction.create({
      data: {
        caseId: expediente.id,
        kind: decision.kind,
        sequence: decision.kind === 'advertencia' ? decision.sequence : 1,
        issuedAt: now,
        issuedById: session.user.id,
        issuedByName: actorName,
        supervisorName: session.user.role === 'admin_staff' ? actorName : null,
        adminName: settings?.adminName ?? null,
        observation: input.observation?.trim() || null,
        bodyText,
        emailTo: owner?.email ?? null,
        fineAmount: decision.kind === 'multa' ? Number(tipo.fineAmount) : null,
        evidences: {
          create: input.evidences.map((e) => ({
            fileRef: e.fileRef,
            fileName: e.fileName,
            mimeType: e.mimeType,
            kind: e.kind,
            sizeBytes: e.sizeBytes,
          })),
        },
      },
    });

    await logActivity(tx, companyId, {
      userId: session.user.id,
      userName: actorName,
      module: 'Incumplimientos',
      action: decision.kind === 'multa' ? 'Multa aplicada' : `Notificación ${decision.sequence}.ª emitida`,
      target: `${property.code} · ${tipo.name} · ${caseNumber}`,
    });

    return { expediente, accion };
  });

  // ---- 4. Multa: cuenta por cobrar en el módulo financiero ----
  let chargeId: string | null = null;
  if (decision.kind === 'multa' && Number(tipo.fineAmount) > 0) {
    try {
      const vence = new Date(now.getTime() + 30 * 86_400_000);
      const charge = await addManualCharge(companyId, {
        condominiumId: input.condominiumId,
        propertyId: input.propertyId,
        chargeType: 'multa',
        description: `Multa por ${tipo.name} — expediente ${caseNumber}`,
        amount: Number(tipo.fineAmount),
        dueDate: vence,
      });
      chargeId = charge.id;
      await withTenantContext(companyId, (tx) =>
        tx.violationAction.update({ where: { id: escritura.accion.id }, data: { chargeId } })
      );
    } catch (e: any) {
      // El módulo financiero puede estar cerrado por período contable.
      // La resolución existe igual; el cobro se registra después.
      await withTenantContext(companyId, (tx) =>
        tx.violationAction.update({
          where: { id: escritura.accion.id },
          data: { emailError: `No se pudo generar el cobro: ${e?.message ?? 'error'}` },
        })
      );
    }
  }

  // ---- 5. PDF con las fotos, al repositorio del condominio ----
  let documentRef: string | null = null;
  try {
    const actor = await actorFromSession(session as any);
    const imagenes: EvidenceImage[] = [];
    for (const ev of input.evidences.filter((e) => e.kind === 'imagen')) {
      const objectId = objectIdFromRef(ev.fileRef);
      if (!objectId) continue;
      try {
        const obj = await readObject(actor, objectId);
        imagenes.push({ data: obj.data, ext: path.extname(obj.name).toLowerCase() });
      } catch {
        // Una foto ilegible no puede impedir que salga la notificación.
      }
    }

    let logo: { data: Buffer; ext: string } | null = null;
    if (settings?.logoUrl) {
      const logoId = objectIdFromRef(settings.logoUrl);
      if (logoId) {
        try {
          const obj = await readObject(actor, logoId);
          logo = { data: obj.data, ext: path.extname(obj.name).toLowerCase() };
        } catch {
          logo = null;
        }
      }
    }

    const pdfBytes = await buildViolationNoticePdf({
      kind: decision.kind,
      sequence: decision.kind === 'advertencia' ? decision.sequence : 1,
      caseNumber,
      condominiumName: property.condominium.name,
      propertyCode: property.code,
      ownerName: owner?.fullName ?? 'Propietario',
      violationName: tipo.name,
      regulationArticle: tipo.regulationArticle,
      issuedAt: now,
      bodyText,
      observation: input.observation,
      fineAmount: decision.kind === 'multa' ? Number(tipo.fineAmount) : null,
      currency: property.condominium.currency,
      responseDays,
      supervisorName: session.user.role === 'admin_staff' ? actorName : null,
      adminName: settings?.adminName ?? null,
      branding: {
        primaryColor: settings?.primaryColor ?? '#3B6EF5',
        headerText: settings?.headerText,
        footerText: settings?.footerText,
        adminDetails: settings?.adminDetails,
        signerName: settings?.signerName,
        signerTitle: settings?.signerTitle,
        logo,
      },
      images: imagenes,
    });

    // Carpeta propia del módulo: el expediente no se mezcla con los
    // comunicados, y la regla de lectura por destinatario permite que el
    // residente abra SU aviso sin ver el resto de la carpeta.
    const carpeta = await folderBySlug(companyId, input.condominiumId, 'incumplimientos');
    const nombre = `${caseNumber} - ${decision.kind === 'multa' ? 'Resolucion de multa' : `Notificacion ${decision.sequence}`} - ${property.code}.pdf`;
    const guardado = await uploadToFolder(actor, {
      folderId: carpeta.id,
      fileName: nombre,
      mimeType: 'application/pdf',
      data: pdfBytes,
      ownerPersonId: owner?.id ?? null,
      userId: session.user.id,
      userName: actorName,
    });
    documentRef = refFromObjectId(guardado.id);

    await withTenantContext(companyId, (tx) =>
      tx.violationAction.update({ where: { id: escritura.accion.id }, data: { documentRef } })
    );
  } catch (e: any) {
    await withTenantContext(companyId, (tx) =>
      tx.violationAction.update({
        where: { id: escritura.accion.id },
        data: { emailError: `No se pudo generar el documento: ${e?.message ?? 'error'}` },
      })
    );
  }

  // ---- 6. Correo (lo último: si falla, la gestión ya quedó registrada) ----
  let emailStatus: 'enviado' | 'sin_configurar' | 'error' | 'sin_destinatario' = 'sin_configurar';
  let emailError: string | null = null;

  if (!owner?.email) {
    emailStatus = 'sin_destinatario';
  } else if (!isEmailConfigured()) {
    emailStatus = 'sin_configurar';
  } else {
    try {
      await sendEmail({
        to: owner.email,
        subject:
          decision.kind === 'multa'
            ? `Resolución de multa — ${property.code} · ${tipo.name}`
            : `Notificación de incumplimiento — ${property.code} · ${tipo.name}`,
        html: noticeEmailHtml({
          ownerName: owner.fullName,
          condominiumName: property.condominium.name,
          propertyCode: property.code,
          violationName: tipo.name,
          kind: decision.kind,
          caseNumber,
          amount: decision.kind === 'multa' ? money(Number(tipo.fineAmount), property.condominium.currency) : null,
        }),
      });
      emailStatus = 'enviado';
    } catch (e: any) {
      emailStatus = 'error';
      emailError = e?.message ?? 'error al enviar';
    }
  }

  await withTenantContext(companyId, (tx) =>
    tx.violationAction.update({
      where: { id: escritura.accion.id },
      data: { emailStatus, emailError: emailError ?? undefined },
    })
  );

  return {
    caseId: escritura.expediente.id,
    caseNumber,
    actionId: escritura.accion.id,
    kind: decision.kind,
    sequence: decision.kind === 'advertencia' ? decision.sequence : 1,
    documentRef,
    emailStatus,
    chargeId,
    fineAmount: decision.kind === 'multa' ? Number(tipo.fineAmount) : null,
  };
}

function noticeEmailHtml(i: {
  ownerName: string;
  condominiumName: string;
  propertyCode: string;
  violationName: string;
  kind: 'advertencia' | 'multa';
  caseNumber: string;
  amount: string | null;
}): string {
  const titulo = i.kind === 'multa' ? 'Resolución de multa' : 'Notificación de incumplimiento';
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e8ec">
    <div style="background:${i.kind === 'multa' ? '#b32626' : '#3B6EF5'};padding:18px 22px;color:#fff">
      <p style="margin:0;font-size:17px;font-weight:700">${titulo}</p>
      <p style="margin:4px 0 0;font-size:13px;opacity:.9">${e(i.condominiumName)}</p>
    </div>
    <div style="padding:22px">
      <p style="margin:0 0 12px;font-size:14px;color:#111">Estimado(a) ${e(i.ownerName)}:</p>
      <p style="margin:0 0 14px;font-size:14px;color:#333;line-height:1.55">
        La Administración le comunica una ${i.kind === 'multa' ? 'resolución de multa' : 'notificación de incumplimiento'}
        correspondiente a la filial <strong>${e(i.propertyCode)}</strong> por <strong>${e(i.violationName)}</strong>.
      </p>
      ${i.amount ? `<p style="margin:0 0 14px;font-size:15px;color:#b32626;font-weight:700">Monto: ${e(i.amount)}</p>` : ''}
      <p style="margin:0 0 18px;font-size:13px;color:#555">Expediente ${e(i.caseNumber)}</p>
      <a href="${appUrl()}/portal/incumplimientos"
         style="display:inline-block;background:#3B6EF5;color:#fff;text-decoration:none;padding:11px 18px;border-radius:9px;font-size:14px;font-weight:600">
        Ver la notificación completa
      </a>
      <p style="margin:18px 0 0;font-size:12px;color:#777;line-height:1.5">
        En su portal puede leer el detalle, ver las fotografías y descargar el documento en PDF.
      </p>
    </div>
  </div></body></html>`;
}

// ============================================================
// Expedientes — consulta
// ============================================================

export async function listCases(
  companyId: string,
  condominiumId: string,
  filtros: { status?: string; typeId?: string; propertyId?: string; desde?: Date; hasta?: Date } = {}
) {
  return withTenantContext(companyId, (tx) =>
    tx.violationCase.findMany({
      where: {
        condominiumId,
        ...(filtros.status ? { status: filtros.status as any } : {}),
        ...(filtros.typeId ? { violationTypeId: filtros.typeId } : {}),
        ...(filtros.propertyId ? { propertyId: filtros.propertyId } : {}),
        ...(filtros.desde || filtros.hasta
          ? { openedAt: { ...(filtros.desde ? { gte: filtros.desde } : {}), ...(filtros.hasta ? { lte: filtros.hasta } : {}) } }
          : {}),
      },
      include: {
        violationType: { select: { name: true, icon: true } },
        property: { select: { code: true } },
        person: { select: { fullName: true } },
        actions: { orderBy: { issuedAt: 'desc' }, select: { id: true, kind: true, sequence: true, issuedAt: true, readAt: true } },
      },
      orderBy: { openedAt: 'desc' },
      take: 300,
    })
  );
}

export async function getCase(companyId: string, caseId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.violationCase.findFirst({
      where: { id: caseId, condominium: { companyId } },
      include: {
        violationType: true,
        property: { select: { code: true, condominiumId: true } },
        person: { select: { fullName: true, email: true } },
        condominium: { select: { name: true, currency: true } },
        actions: {
          orderBy: { issuedAt: 'asc' },
          include: { evidences: true, charge: { select: { id: true, status: true, amount: true } } },
        },
      },
    })
  );
}

export async function closeCase(companyId: string, caseId: string, motivo: string, actor: { userId: string; userName: string }) {
  return withTenantContext(companyId, async (tx) => {
    const c = await tx.violationCase.findFirst({ where: { id: caseId, condominium: { companyId } } });
    if (!c) throw new Error('El expediente no existe.');
    const actualizado = await tx.violationCase.update({
      where: { id: caseId },
      data: { status: 'cerrado', closedAt: new Date(), closeReason: motivo.trim() || null, nextActionDueAt: null },
    });
    await logActivity(tx, companyId, {
      userId: actor.userId,
      userName: actor.userName,
      module: 'Incumplimientos',
      action: 'Expediente cerrado',
      target: `${c.caseNumber}: ${motivo}`,
    });
    return actualizado;
  });
}

// ============================================================
// Portal del residente
// ============================================================

/** Notificaciones dirigidas a la filial del residente. */
export async function listResidentNotices(companyId: string, propertyId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.violationAction.findMany({
      where: { case: { propertyId } },
      include: {
        evidences: true,
        case: {
          select: {
            caseNumber: true,
            violationType: { select: { name: true, regulationArticle: true } },
            condominium: { select: { name: true, currency: true } },
            property: { select: { code: true } },
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
    })
  );
}

export async function countUnreadNotices(companyId: string, propertyId: string): Promise<number> {
  return withTenantContext(companyId, (tx) =>
    tx.violationAction.count({ where: { case: { propertyId }, readAt: null } })
  );
}

/**
 * Acuse de lectura. Solo el residente de esa filial puede marcarlo, y
 * solo una vez: la primera fecha es la que vale como constancia.
 */
export async function markNoticeRead(
  companyId: string,
  actionId: string,
  propertyId: string,
  userId: string
) {
  return withTenantContext(companyId, async (tx) => {
    const accion = await tx.violationAction.findFirst({
      where: { id: actionId, case: { propertyId } },
      select: { id: true, readAt: true },
    });
    if (!accion) throw new Error('Esa notificación no corresponde a tu filial.');
    if (accion.readAt) return accion;
    return tx.violationAction.update({
      where: { id: actionId },
      data: { readAt: new Date(), readByUserId: userId },
    });
  });
}
