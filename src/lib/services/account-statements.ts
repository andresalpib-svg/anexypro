import path from 'node:path';
import { withTenantContext, prisma } from '@/lib/db';
import { logActivity } from '@/lib/services/audit';
import { getAccountSnapshot, getTemplate } from '@/lib/services/document-requests';
import { sendEmail, isEmailConfigured, accountStatementEmailHtml } from '@/lib/email';
import { objectIdFromRef } from '@/lib/services/file-refs';
import { actorFromSession, readObject } from '@/lib/services/storage';
import { buildAccountStatementPdf, type AccountStatementLogo } from '@/lib/pdf/account-statement';

/**
 * Módulo "Estados de Cuenta" — vista administrativa en lote sobre lo
 * que ya calculan `finance.ts` (saldo) y `document-requests.ts`
 * (foto AL DÍA / EN ATRASO), pensada para que administración y
 * supervisión apliquen pagos y reenvíen el estado de cuenta de UNA
 * filial concreta.
 *
 * Aislamiento: toda función de aquí recibe `companyId` explícito y
 * corre dentro de `withTenantContext` (RLS de Postgres, no solo
 * filtro de aplicación). El cruce entre condominios/filiales lo
 * cierra además quien llama (`actions.ts`), resolviendo el
 * condominio REAL de la filial con `condoOfProperty` antes de confiar
 * en cualquier id que venga del formulario — nunca al revés.
 */

/** Encabezado de la filial para la pantalla de detalle y el correo. */
export async function getStatementHeader(companyId: string, propertyId: string) {
  return withTenantContext(companyId, async (tx) => {
    const property = await tx.property.findUniqueOrThrow({
      where: { id: propertyId },
      select: {
        id: true,
        code: true,
        propertyType: true,
        condominiumId: true,
        condominium: { select: { id: true, name: true, currency: true } },
        // Miembro vigente principal (propietario primero, por orden
        // del enum PropertyRole) — mismo criterio que la notificación
        // de incumplimientos, para prellenar el destinatario del
        // correo sin inventar un campo nuevo de "contacto".
        members: {
          where: { endDate: null },
          orderBy: { role: 'asc' },
          take: 1,
          select: { person: { select: { fullName: true, email: true } } },
        },
      },
    });
    return {
      id: property.id,
      code: property.code,
      propertyType: property.propertyType,
      condominium: property.condominium,
      ownerName: property.members[0]?.person.fullName ?? null,
      ownerEmail: property.members[0]?.person.email ?? null,
    };
  });
}

/** Movimientos (cargos + pagos) de una filial, listos para tabla o correo. */
export async function listStatementMovements(companyId: string, propertyId: string) {
  return withTenantContext(companyId, async (tx) => {
    const [charges, payments] = await Promise.all([
      tx.charge.findMany({
        where: { propertyId },
        orderBy: { dueDate: 'desc' },
        select: {
          id: true,
          dueDate: true,
          description: true,
          amount: true,
          status: true,
          allocations: { select: { amount: true } },
        },
      }),
      tx.payment.findMany({
        where: { propertyId },
        orderBy: { paymentDate: 'desc' },
        select: {
          id: true,
          paymentDate: true,
          method: true,
          reference: true,
          amount: true,
          status: true,
          receiptUrl: true,
          allocations: { select: { amount: true, charge: { select: { description: true } } } },
        },
      }),
    ]);

    const rows = [
      ...charges
        .filter((c) => c.status !== 'anulado')
        .map((c) => {
          const alreadyPaid = c.allocations.reduce((s, a) => s + Number(a.amount), 0);
          return {
            // Identificador ESTABLE de la fila — lo usa `key` en la
            // tabla del detalle. Antes se usaba el índice del arreglo
            // como `key`, y como un pago aplicado inserta una fila
            // nueva y cambia el orden, React reciclaba el estado del
            // formulario (`useFormState`) de una fila para OTRA en el
            // siguiente render: el mensaje "Pago aplicado" y el pago
            // mismo terminaban en la línea vecina, no en la que el
            // administrador tocó. Con un id real por fila, React no
            // vuelve a mezclar componentes de filas distintas.
            rowKey: `charge-${c.id}`,
            date: c.dueDate,
            desc: c.description,
            reference: '',
            charge: Number(c.amount),
            credit: 0,
            // Solo presente en líneas de COBRO — la columna "Pago" del
            // estado de cuenta administrativo usa esto para decidir si
            // esa línea todavía admite un pago dirigido (chargeId) y
            // con cuánto prellenar la casilla (chargeOwed).
            chargeId: c.id as string | undefined,
            chargeStatus: c.status as string | undefined,
            chargeOwed: Math.max(0, Number(c.amount) - alreadyPaid),
            receiptUrl: undefined as string | null | undefined,
          };
        }),
      ...payments
        .filter((p) => p.status === 'aplicado')
        .map((p) => {
          // La descripción de una línea de pago cuenta A QUÉ se aplicó,
          // no cómo llegó el dinero: "Pago por <cargo>" en vez de "Pago
          // recibido · sinpe" — el método sigue eligiéndose al aplicar
          // el pago, solo que ya no hacía falta repetirlo acá. Sin
          // asignación (adelanto sin cargo, "Saldo a favor") no hay a
          // qué apuntar, así que ahí sí se conserva el método.
          const linkedTo = p.allocations.length > 0 ? p.allocations.map((a) => a.charge.description).join(' · ') : '';
          return {
            rowKey: `payment-${p.id}`,
            date: p.paymentDate,
            desc: linkedTo ? `Pago por ${linkedTo}` : `Pago recibido · ${p.method}`,
            reference: p.reference ?? '',
            charge: 0,
            credit: Number(p.amount),
            // Una línea de PAGO nunca vuelve a admitir un pago dirigido
            // — se deja sin definir a propósito, mismas claves que la
            // rama de cargos para que ambos lados del arreglo compartan
            // forma (ver más abajo).
            chargeId: undefined as string | undefined,
            chargeStatus: undefined as string | undefined,
            chargeOwed: undefined as number | undefined,
            receiptUrl: p.receiptUrl,
          };
        }),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    return rows;
  });
}

/**
 * Resuelve una referencia de logo (`/api/archivo/<id>` del repositorio
 * privado) a los bytes reales, para poder incrustarla en el PDF.
 * Nunca lanza: un logo faltante, con una referencia externa (no del
 * repositorio) o ilegible no puede impedir que salga el estado de
 * cuenta — mismo criterio que `violations.ts` con el logo de
 * incumplimientos.
 */
async function resolveLogo(
  actor: Awaited<ReturnType<typeof actorFromSession>>,
  ref: string | null | undefined
): Promise<AccountStatementLogo | null> {
  if (!ref) return null;
  const objectId = objectIdFromRef(ref);
  if (!objectId) return null;
  try {
    const obj = await readObject(actor, objectId);
    return { data: obj.data, ext: path.extname(obj.name).toLowerCase() };
  } catch {
    return null;
  }
}

/**
 * Envía el estado de cuenta de UNA filial por correo al destinatario
 * indicado, como PDF adjunto — el correo mismo es solo una nota de
 * aviso (`accountStatementEmailHtml`), el documento formal completo
 * (histórico, logos del condominio y de la administradora) va en el
 * PDF (`buildAccountStatementPdf`).
 *
 * La foto financiera se recalcula al momento de enviar (no se
 * reutiliza nada que haya llegado del navegador): es lo mismo que ve
 * el PDF y lo que la administración tenía enfrente al pulsar "Enviar".
 *
 * `condominiumId` ya viene validado por quien llama (actions.ts,
 * contra `condoOfProperty`) — aquí se vuelve a comprobar como defensa
 * en profundidad, por si esta función se invoca alguna vez desde otro
 * lugar sin ese paso.
 */
export async function sendAccountStatementEmail(
  companyId: string,
  input: { condominiumId: string; propertyId: string; to: string },
  actor: { id: string; name: string; companyId: string; role: string; personId?: string | null; isBoardMember?: boolean }
): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error('El envío de correos no está configurado en este ambiente.');
  }

  const header = await getStatementHeader(companyId, input.propertyId);
  if (header.condominium.id !== input.condominiumId) {
    throw new Error('La filial no pertenece a ese condominio.');
  }

  const [movements, snapshot, template, company] = await Promise.all([
    listStatementMovements(companyId, input.propertyId),
    getAccountSnapshot(companyId, input.propertyId),
    // El logo del condominio sale de la MISMA plantilla que ya usa el
    // documento formal que ve el residente (`documento/[id]/page.tsx`)
    // — si nunca se configuró una plantilla propia, `getTemplate` cae
    // sola al logo crudo del condominio. Un solo lugar decide "cuál es
    // el logo del condominio", no dos.
    getTemplate(companyId, input.condominiumId, 'estado_cuenta'),
    prisma.company.findUnique({ where: { id: companyId }, select: { logoUrl: true } }),
  ]);

  // ÚNICAMENTE estos dos logos van al documento — el del condominio y
  // el de la empresa administradora (el "usuario administrador" es
  // personal de esa empresa). Ningún otro elemento de marca.
  const actorCtx = await actorFromSession({ user: actor });
  const [condoLogo, companyLogo] = await Promise.all([
    resolveLogo(actorCtx, template.logoUrl),
    resolveLogo(actorCtx, company?.logoUrl),
  ]);

  const pdfBytes = await buildAccountStatementPdf({
    condominiumName: header.condominium.name,
    propertyCode: header.code,
    ownerName: header.ownerName,
    currency: header.condominium.currency,
    issuedAt: new Date(),
    snapshot,
    movements,
    condoLogo,
    companyLogo,
  });

  const html = accountStatementEmailHtml({
    condominiumName: header.condominium.name,
    propertyCode: header.code,
    currency: header.condominium.currency,
    snapshot,
  });

  await sendEmail({
    to: input.to,
    subject: `Estado de cuenta · ${header.code} · ${header.condominium.name}`,
    html,
    attachments: [{ filename: `estado-de-cuenta-${header.code}.pdf`, content: pdfBytes }],
  });

  await withTenantContext(companyId, (tx) =>
    logActivity(tx, companyId, {
      userId: actor.id,
      userName: actor.name,
      module: 'Estados de Cuenta',
      action: 'Estado de cuenta enviado por correo (PDF adjunto)',
      target: `${header.code} → ${input.to}`,
    })
  );
}
