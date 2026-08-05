import { withTenantContext, prisma } from '@/lib/db';
import { logActivity } from '@/lib/services/audit';

/**
 * Emisión de documentos a solicitud del condómino.
 *
 *  - Certificación de cuotas al día: por definición SOLO se emite si
 *    la filial no tiene ningún cobro atrasado (regla dura, se valida
 *    al solicitar y otra vez al aprobar — el saldo puede cambiar en
 *    medio).
 *  - Estado de cuenta: se emite siempre; el documento mismo declara
 *    si la propiedad está AL DÍA o EN ATRASO.
 *
 * El plazo de entrega es de 2 DÍAS HÁBILES (sábado y domingo no
 * cuentan) y se calcula al momento de solicitar.
 */

export const DOC_TYPE_LABEL: Record<string, string> = {
  certificacion_cuotas_al_dia: 'Certificación de cuotas al día',
  estado_cuenta: 'Estado de cuenta',
};

export const DELIVERY_BUSINESS_DAYS = 2;

/** Suma días hábiles (omite sábado y domingo). */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

export type AccountSnapshot = {
  charged: number;
  paid: number;
  balance: number;
  overdueCount: number;
  overdueAmount: number;
  isCurrent: boolean;
};

/**
 * Situación financiera de la filial. "Al día" = ningún cargo vencido
 * pendiente o parcial (cualquier tipo de cobro, no solo la cuota).
 */
export async function getAccountSnapshot(companyId: string, propertyId: string): Promise<AccountSnapshot> {
  return withTenantContext(companyId, async (tx) => {
    const charges = await tx.charge.findMany({
      where: { propertyId, status: { not: 'anulado' } },
      include: { allocations: { select: { amount: true } } },
    });
    const payments = await tx.payment.findMany({ where: { propertyId, status: 'aplicado' }, select: { amount: true } });

    const charged = charges.reduce((s, c) => s + Number(c.amount), 0);
    const paid = payments.reduce((s, p) => s + Number(p.amount), 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = charges.filter((c) => {
      if (!['pendiente', 'parcial'].includes(c.status)) return false;
      return new Date(c.dueDate) < today;
    });
    const overdueAmount = overdue.reduce(
      (s, c) => s + (Number(c.amount) - c.allocations.reduce((a, x) => a + Number(x.amount), 0)),
      0
    );

    const balance = charges.reduce(
      (s, c) => s + Number(c.amount) - c.allocations.reduce((a, x) => a + Number(x.amount), 0),
      0
    );

    return {
      charged,
      paid,
      balance,
      overdueCount: overdue.length,
      overdueAmount,
      isCurrent: overdue.length === 0,
    };
  });
}

// ---------- Plantillas (diseño y contenido) ----------
export const DEFAULT_BODY: Record<string, string> = {
  certificacion_cuotas_al_dia:
    'Por medio de la presente, la administración del condominio hace constar que la filial indicada se encuentra AL DÍA en el pago de sus cuotas condominales y demás cobros a la fecha de emisión de este documento.\n\nSe extiende la presente certificación a solicitud del interesado para los fines que estime convenientes.',
  estado_cuenta:
    'Se detalla a continuación el estado de cuenta de la filial indicada, con el histórico de cobros y pagos registrados a la fecha de emisión.\n\nAnte cualquier duda sobre este estado de cuenta, contacte a la Administración.',
};

export async function getTemplate(companyId: string, condominiumId: string, docType: string) {
  return withTenantContext(companyId, async (tx) => {
    const existing = await tx.documentTemplate.findUnique({
      where: { condominiumId_docType: { condominiumId, docType: docType as any } },
    });
    if (existing) return existing;
    // Plantilla implícita: hereda logo del condominio y datos de la
    // administradora; no se persiste hasta que alguien la edite.
    const condo = await tx.condominium.findUniqueOrThrow({
      where: { id: condominiumId },
      include: { company: true },
    });
    return {
      id: '',
      condominiumId,
      docType: docType as any,
      logoUrl: condo.logoUrl,
      primaryColor: '#3B6EF5',
      headerText: condo.name,
      footerText: condo.addressLine,
      adminName: condo.company.tradeName ?? condo.company.legalName,
      adminDetails: [condo.company.taxId, condo.company.phone, condo.company.email].filter(Boolean).join(' · ') || null,
      bodyTemplate: DEFAULT_BODY[docType] ?? '',
      signerName: null,
      signerTitle: 'Administración',
      signatureUrl: null,
      requiresCurrentAccount: docType === 'certificacion_cuotas_al_dia',
    };
  });
}

export async function saveTemplate(
  companyId: string,
  condominiumId: string,
  docType: string,
  input: {
    logoUrl?: string;
    primaryColor: string;
    headerText?: string;
    footerText?: string;
    adminName?: string;
    adminDetails?: string;
    bodyTemplate?: string;
    signerName?: string;
    signerTitle?: string;
    signatureUrl?: string;
    requiresCurrentAccount: boolean;
  }
) {
  return withTenantContext(companyId, (tx) =>
    tx.documentTemplate.upsert({
      where: { condominiumId_docType: { condominiumId, docType: docType as any } },
      create: {
        condominiumId,
        docType: docType as any,
        logoUrl: input.logoUrl || null,
        primaryColor: input.primaryColor,
        headerText: input.headerText || null,
        footerText: input.footerText || null,
        adminName: input.adminName || null,
        adminDetails: input.adminDetails || null,
        bodyTemplate: input.bodyTemplate || null,
        signerName: input.signerName || null,
        signerTitle: input.signerTitle || null,
        signatureUrl: input.signatureUrl || null,
        requiresCurrentAccount: input.requiresCurrentAccount,
      },
      update: {
        ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
        primaryColor: input.primaryColor,
        headerText: input.headerText || null,
        footerText: input.footerText || null,
        adminName: input.adminName || null,
        adminDetails: input.adminDetails || null,
        bodyTemplate: input.bodyTemplate || null,
        signerName: input.signerName || null,
        signerTitle: input.signerTitle || null,
        // Sin imagen nueva se conserva la que ya estaba.
        ...(input.signatureUrl ? { signatureUrl: input.signatureUrl } : {}),
        requiresCurrentAccount: input.requiresCurrentAccount,
      },
    })
  );
}

// ---------- Solicitud (residente) ----------
export async function requestDocument(
  companyId: string,
  input: { condominiumId: string; propertyId: string; personId: string; docType: string; note?: string },
  actor: { userId: string; userName: string }
) {
  const template = await getTemplate(companyId, input.condominiumId, input.docType);
  const snapshot = await getAccountSnapshot(companyId, input.propertyId);

  if (template.requiresCurrentAccount && !snapshot.isCurrent) {
    throw new Error(
      `No es posible solicitar "${DOC_TYPE_LABEL[input.docType]}": la filial tiene ${snapshot.overdueCount} cobro(s) atrasado(s). Ponte al día o contacta a la Administración.`
    );
  }

  return withTenantContext(companyId, async (tx) => {
    const pending = await tx.documentRequest.findFirst({
      where: { propertyId: input.propertyId, docType: input.docType as any, status: 'solicitada' },
    });
    if (pending) {
      throw new Error(`Ya tienes una solicitud de "${DOC_TYPE_LABEL[input.docType]}" en trámite.`);
    }

    const request = await tx.documentRequest.create({
      data: {
        condominiumId: input.condominiumId,
        propertyId: input.propertyId,
        personId: input.personId,
        docType: input.docType as any,
        dueBy: addBusinessDays(new Date(), DELIVERY_BUSINESS_DAYS),
        note: input.note || null,
        bodyText: template.bodyTemplate,
      },
    });
    await logActivity(tx, companyId, {
      userId: actor.userId,
      userName: actor.userName,
      module: 'Documentos',
      action: 'Solicitud de emisión de documento',
      target: DOC_TYPE_LABEL[input.docType] ?? input.docType,
    });
    return request;
  });
}

// ---------- Aprobación / rechazo (administración o supervisión) ----------
export async function approveRequest(
  companyId: string,
  requestId: string,
  actor: { userId: string; userName: string },
  bodyText?: string
) {
  const request = await prisma.documentRequest.findFirstOrThrow({
    where: { id: requestId, condominium: { companyId } },
  });
  const template = await getTemplate(companyId, request.condominiumId, request.docType);
  const snapshot = await getAccountSnapshot(companyId, request.propertyId);

  // Segunda validación: el saldo pudo cambiar entre la solicitud y la
  // aprobación — una certificación jamás se emite con cobros vencidos.
  if (template.requiresCurrentAccount && !snapshot.isCurrent) {
    throw new Error(
      `No se puede emitir la certificación: la filial tiene ${snapshot.overdueCount} cobro(s) atrasado(s) por ${snapshot.overdueAmount.toLocaleString('es-CR')}.`
    );
  }

  return withTenantContext(companyId, async (tx) => {
    const updated = await tx.documentRequest.update({
      where: { id: requestId },
      data: {
        status: 'aprobada',
        decidedById: actor.userId,
        decidedByName: actor.userName,
        decidedAt: new Date(),
        bodyText: bodyText ?? request.bodyText,
        issuedBalance: snapshot.balance,
        issuedCharged: snapshot.charged,
        issuedPaid: snapshot.paid,
        issuedCurrent: snapshot.isCurrent,
      },
      include: { property: { select: { code: true } } },
    });
    await logActivity(tx, companyId, {
      userId: actor.userId,
      userName: actor.userName,
      module: 'Documentos',
      action: 'Documento emitido',
      target: `${DOC_TYPE_LABEL[request.docType]} · ${updated.property.code}`,
    });
    return updated;
  });
}

export async function rejectRequest(
  companyId: string,
  requestId: string,
  reason: string,
  actor: { userId: string; userName: string }
) {
  return withTenantContext(companyId, async (tx) => {
    const updated = await tx.documentRequest.update({
      where: { id: requestId },
      data: { status: 'rechazada', rejectReason: reason, decidedById: actor.userId, decidedByName: actor.userName, decidedAt: new Date() },
      include: { property: { select: { code: true } } },
    });
    await logActivity(tx, companyId, {
      userId: actor.userId,
      userName: actor.userName,
      module: 'Documentos',
      action: 'Solicitud de documento rechazada',
      target: `${DOC_TYPE_LABEL[updated.docType]} · ${updated.property.code}`,
    });
    return updated;
  });
}

// ---------- Consultas ----------
export async function listRequestsByProperty(companyId: string, propertyId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.documentRequest.findMany({
      where: { propertyId },
      orderBy: { requestedAt: 'desc' },
    })
  );
}

export async function listRequestsByCondo(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.documentRequest.findMany({
      where: { condominiumId },
      orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
      include: { property: { select: { code: true } }, person: { select: { fullName: true } } },
    })
  );
}

/** Datos completos para renderizar el documento emitido. */
export async function getIssuedDocument(companyId: string, requestId: string) {
  const request = await prisma.documentRequest.findFirst({
    where: { id: requestId, condominium: { companyId } },
    include: {
      condominium: { include: { company: true } },
      property: true,
      person: true,
    },
  });
  if (!request) return null;

  const template = await getTemplate(companyId, request.condominiumId, request.docType);
  // Movimientos históricos para el estado de cuenta.
  const [charges, payments] = await withTenantContext(companyId, (tx) =>
    Promise.all([
      tx.charge.findMany({
        where: { propertyId: request.propertyId, status: { not: 'anulado' } },
        orderBy: { dueDate: 'asc' },
        include: { allocations: { select: { amount: true } } },
      }),
      tx.payment.findMany({
        where: { propertyId: request.propertyId, status: 'aplicado' },
        orderBy: { paymentDate: 'asc' },
      }),
    ])
  );

  return { request, template, charges, payments };
}
