import { withTenantContext } from '@/lib/db';
import { etiquetaTipoVisita } from '@/lib/etiquetas-visita';

export async function listIncidents(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) => tx.incident.findMany({ where: { condominiumId }, orderBy: { createdAt: 'desc' } }));
}

export async function createIncident(
  companyId: string,
  userId: string,
  input: { condominiumId: string; category: string; title: string; description?: string }
) {
  return withTenantContext(companyId, (tx) =>
    tx.incident.create({
      data: { condominiumId: input.condominiumId, category: input.category as any, title: input.title, description: input.description || null, reportedById: userId },
    })
  );
}

export async function setIncidentStatus(companyId: string, incidentId: string, status: string) {
  return withTenantContext(companyId, (tx) =>
    tx.incident.update({ where: { id: incidentId }, data: { status: status as any, resolvedAt: status === 'cerrado' ? new Date() : null } })
  );
}

export async function listPackages(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.package.findMany({ where: { condominiumId }, orderBy: { receivedAt: 'desc' }, include: { property: { select: { code: true } } } })
  );
}

export async function receivePackage(
  companyId: string,
  userId: string,
  input: { condominiumId: string; propertyId: string; courier?: string; description?: string }
) {
  return withTenantContext(companyId, (tx) =>
    tx.package.create({
      data: { condominiumId: input.condominiumId, propertyId: input.propertyId, courier: input.courier || null, description: input.description || null, receivedById: userId },
    })
  );
}

export async function deliverPackage(companyId: string, packageId: string, userId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.package.update({ where: { id: packageId }, data: { status: 'entregado', deliveredAt: new Date(), deliveredById: userId } })
  );
}

export type SecurityLogEntry = { occurredAt: Date; kind: 'ingreso' | 'salida' | 'paquete' | 'incidente'; summary: string };

/** Bitácora unificada — equivalente en la app a v_security_log (prisma/sql/01_views_functions_triggers.sql). */
export async function getSecurityLog(companyId: string, condominiumId: string): Promise<SecurityLogEntry[]> {
  return withTenantContext(companyId, async (tx) => {
    const [checkins, packages, incidents] = await Promise.all([
      tx.visitCheckin.findMany({
        where: { authorization: { condominiumId } },
        include: { authorization: { select: { visitorName: true, visitType: true } } },
      }),
      tx.package.findMany({ where: { condominiumId } }),
      tx.incident.findMany({ where: { condominiumId } }),
    ]);

    const entries: SecurityLogEntry[] = [];
    for (const c of checkins) {
      entries.push({ occurredAt: c.checkinAt, kind: 'ingreso', summary: `${c.authorization.visitorName} — ${etiquetaTipoVisita(c.authorization.visitType)}` });
      if (c.checkoutAt) entries.push({ occurredAt: c.checkoutAt, kind: 'salida', summary: `${c.authorization.visitorName} — ${etiquetaTipoVisita(c.authorization.visitType)}` });
    }
    for (const p of packages) entries.push({ occurredAt: p.receivedAt, kind: 'paquete', summary: `${p.courier ?? 'Paquete'} — recibido` });
    for (const i of incidents) entries.push({ occurredAt: i.createdAt, kind: 'incidente', summary: `${i.title} — ${i.category}` });

    return entries.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 100);
  });
}
