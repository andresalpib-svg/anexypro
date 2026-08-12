import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { DemoStatus } from '@prisma/client';
import { prisma, withTenantContext } from '@/lib/db';
import { demoLifecycleDates } from '@/lib/domain/demo-lifecycle';
import { subscriptionState } from '@/lib/domain/subscription';
import { emitirToken } from '@/lib/services/password-reset';
import { appUrl } from '@/lib/email';
import { ensureChartOfAccounts } from '@/lib/services/chart-of-accounts';
import { generarPassword } from '@/lib/services/platform';
import { createCondominium, activateCondominium } from '@/lib/services/condominiums';
import { bulkCreateProperties, addPersonToProperty } from '@/lib/services/properties';
import { generateOrdinaryBilling, makePayment } from '@/lib/services/finance';
import { createAmenity } from '@/lib/services/amenities';
import { createReservation } from '@/lib/services/reservations';
import { createVisit, checkIn } from '@/lib/services/visits';
import { createIncident } from '@/lib/services/security';
import { createProject, setProjectStatus, addMilestone, toggleMilestone } from '@/lib/services/projects';
import { createCommunication, publishCommunication } from '@/lib/services/communications';

/**
 * Empresas DEMO — provisión en vivo desde /demo.
 *
 * Cada visitante recibe su PROPIA empresa (`Company.isDemo = true`),
 * aislada del resto por el mismo Row-Level Security que separa a
 * cualquier par de clientes reales (ver `withTenantContext` en
 * `src/lib/db.ts`) — no hace falta ningún mecanismo de aislamiento
 * nuevo. Su repositorio de archivos usa el MISMO proveedor activo de la
 * plataforma (PASO 8 — `providerForCompany` en `src/lib/storage/index.ts`
 * ya NO fuerza `local`), aislada en su propio árbol "DEMOS/DEMO_<id>"
 * — ver `demoDriveFolderId` en el modelo `Company` y `ensureCondoTree`
 * en `services/storage.ts`.
 *
 * El acceso vence solo: el job diario `demo-vencidos`
 * (`src/lib/jobs/index.ts`) BLOQUEA —nunca borra— las empresas demo
 * cuyo `demoExpiresAt` ya pasó, con el mismo campo `Company.blockedAt`
 * que usa cualquier empresa en mora. Las fechas del ciclo de vida
 * (vencimiento, eliminación programada) salen de
 * `domain/demo-lifecycle.ts` — SIEMPRE desde la hora del servidor. El
 * BORRADO físico de esos archivos, al llegar la fecha programada, es
 * PASO 9 — `services/demo-cleanup.ts` (todavía sin disparador
 * automático, ver el comentario ahí).
 */

/** Tope de empresas demo nuevas por hora, contra abuso del formulario público. */
const DEMO_CREATIONS_PER_HOUR = 30;

const SUPERVISOR_PERMISSIONS = {
  finanzas: false,
  contabilidad: false,
  reportes: false,
  auditoria: false,
  asistentesia: false,
};

export type DemoCredential = { role: string; label: string; email: string; password: string };
export type DemoCompanyResult = {
  companyId: string;
  condominiumId: string;
  startedAt: Date;
  expiresAt: Date;
  deleteScheduledAt: Date;
  credentials: DemoCredential[];
};

/** ¿Hay cupo para crear una demo más ahora mismo? Chequeo rápido, NO autoritativo — ver comentario en `createDemoCompany`. */
export async function demoCreationsAvailable(): Promise<boolean> {
  const desde = new Date(Date.now() - 60 * 60 * 1000);
  const enLaUltimaHora = await prisma.company.count({ where: { isDemo: true, createdAt: { gte: desde } } });
  return enLaUltimaHora < DEMO_CREATIONS_PER_HOUR;
}


/**
 * Crea una empresa demo completa: la empresa, su plan de cuentas, un
 * condominio con datos reales (residentes, cobros, pagos, reservas,
 * visitas, un incidente, un proyecto, un comunicado) y una cuenta por
 * cada uno de los 4 roles operativos. Nunca el rol `master`.
 *
 * `opts.createdByUserId` es para cuando algún día un `master` cree una
 * demo desde su panel (no existe esa pantalla todavía) — el alta
 * pública y anónima de /demo no manda nada acá, y `demoCreatedById`
 * queda en NULL. Ninguna otra funcionalidad depende de este dato.
 */
export async function createDemoCompany(opts: { createdByUserId?: string } = {}): Promise<DemoCompanyResult> {
  // Chequeo rápido, NO autoritativo: evita gastar los `bcrypt.hash`
  // caros de más abajo cuando ya es obvio que no hay cupo. El chequeo
  // que decide de verdad está dentro de la transacción, bajo el
  // candado — ver el comentario ahí.
  if (!(await demoCreationsAvailable())) {
    throw new Error('Se crearon demasiadas demos en la última hora. Probá de nuevo en unos minutos.');
  }

  // Hora del SERVIDOR, no la del navegador — de acá salen todas las
  // fechas del ciclo de vida (nunca de un valor que mande el cliente).
  const startedAt = new Date();
  const { expiresAt, deleteScheduledAt } = demoLifecycleDates(startedAt);
  const stamp = startedAt
    .toISOString()
    .slice(0, 16)
    .replace(/[-:T]/g, '');
  // `User.email` es único por EMPRESA (`@@unique([companyId, email])`),
  // no en toda la plataforma — pero el login busca por correo SOLO,
  // sin companyId (todavía no se sabe de qué empresa es nadie). Con
  // "una empresa nueva por visitante" puede haber muchas demos vivas a
  // la vez; sin este sufijo, dos demos con el mismo
  // "admin@demo.anexypro.com" harían que el login de la más nueva
  // encontrara la cuenta de OTRA demo con OTRA contraseña. 3 bytes al
  // azar (no el `stamp`, que solo tiene precisión de minuto) evitan la
  // colisión.
  const uniq = crypto.randomBytes(3).toString('hex');
  const emailFor = (rol: string) => `${rol}.${uniq}@demo.anexypro.com`;

  const ownerPassword = generarPassword();
  const ownerHash = await bcrypt.hash(ownerPassword, 12);

  const { companyId, ownerId, ownerName } = await prisma.$transaction(async (tx) => {
    // Candado de aplicación: serializa la creación de empresas demo
    // para que el chequeo del cupo por hora sea atómico.
    //
    // Antes, `demoCreationsAvailable()` (un `count()`) y el
    // `company.create()` de acá abajo NO eran atómicos entre sí:
    // peticiones concurrentes podían pasar el conteo a la vez, todas
    // antes de que ninguna hubiera insertado, superando el tope de
    // `DEMO_CREATIONS_PER_HOUR` ampliamente (condición de carrera
    // TOCTOU — ver docs/auditoria-seguridad-2026-08-11.md, hallazgo
    // sobre /demo). `pg_advisory_xact_lock` bloquea a cualquier otra
    // transacción que pida la MISMA clave hasta que esta termine
    // (commit o rollback) — así el conteo que sigue ve todo lo que ya
    // se creó, nunca una foto vieja. Se libera solo, nunca hace falta
    // soltarlo a mano. La transacción es corta (crea la empresa y su
    // usuario dueño, no todo el sembrado de datos de la demo, que
    // sigue después en transacciones cortas aparte), así que
    // serializar acá no le cuesta nada perceptible a nadie.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('demo-creation-cap'))`;

    const desdeConCandado = new Date(Date.now() - 60 * 60 * 1000);
    const enLaUltimaHora = await tx.company.count({
      where: { isDemo: true, createdAt: { gte: desdeConCandado } },
    });
    if (enLaUltimaHora >= DEMO_CREATIONS_PER_HOUR) {
      throw new Error('Se crearon demasiadas demos en la última hora. Probá de nuevo en unos minutos.');
    }

    const company = await tx.company.create({
      data: {
        legalName: `Empresa Demo ${stamp}`,
        tradeName: 'ANEXYpro Demo',
        isDemo: true,
        demoStatus: 'DEMO_ACTIVO',
        demoStartedAt: startedAt,
        demoExpiresAt: expiresAt,
        demoDeleteScheduledAt: deleteScheduledAt,
        demoCreatedById: opts.createdByUserId ?? null,
      },
    });
    const owner = await tx.user.create({
      data: {
        companyId: company.id,
        email: emailFor('admin'),
        passwordHash: ownerHash,
        fullName: 'Administrador Demo',
        role: 'admin_owner',
        status: 'activo',
      },
    });
    // Misma regla que un alta real: sin plan de cuentas en la MISMA
    // transacción, el primer cargo aborta buscando la cuenta 1101.
    // `chart_of_accounts` lleva RLS — hay que fijar el contexto a mano
    // porque esta transacción no pasa por `withTenantContext` (todavía
    // no existía `company.id` cuando empezó). Ver la misma nota en
    // `createCompanyWithAdmin` (services/platform.ts).
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_company_id', $1, true)`, company.id);
    await ensureChartOfAccounts(tx, company.id);
    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: null,
        userName: 'Sistema (solicitud demo)',
        module: 'Plataforma',
        action: 'Empresa demo creada',
        target: `Vence ${expiresAt.toISOString()}`,
      },
    });
    // `demo_history_entries` no lleva RLS (como `companies`), así que
    // no hace falta el contexto que sí necesitó `chart_of_accounts`.
    await tx.demoHistoryEntry.create({
      data: {
        companyId: company.id,
        event: 'creada',
        detail: `Vence ${expiresAt.toISOString()} · eliminación programada ${deleteScheduledAt.toISOString()}`,
        actorUserId: opts.createdByUserId ?? null,
      },
    });
    return { companyId: company.id, ownerId: owner.id, ownerName: owner.fullName };
  });

  const actor = { userId: ownerId, userName: ownerName };

  // Todo lo que sigue son transacciones CORTAS por servicio (el mismo
  // patrón que usa el resto de la aplicación) — no hay una única
  // transacción gigante que lo cubra todo. Si algo falla a mitad de
  // camino, la empresa ya existe pero a medias: se BLOQUEA de una vez
  // (nunca se borra, mismo criterio que el resto del sistema) para que
  // no quede una demo a medio sembrar con apariencia de estar activa
  // —nadie llega a verla, porque las credenciales no se devuelven si
  // esto lanza—, y se relanza el error para que quien pidió la demo
  // pueda intentarlo de nuevo.
  try {
    const { condominiumId, condominoPersonId } = await seedDemoCondominium(companyId, actor);

    const credentials: DemoCredential[] = [
      { role: 'admin_owner', label: 'Administrador', email: emailFor('admin'), password: ownerPassword },
    ];

    const supervisorPassword = generarPassword();
    const supervisorEmail = emailFor('supervisor');
    await prisma.user.create({
      data: {
        companyId,
        email: supervisorEmail,
        passwordHash: await bcrypt.hash(supervisorPassword, 12),
        fullName: 'Supervisor Demo',
        role: 'admin_staff',
        status: 'activo',
        staffPermissions: SUPERVISOR_PERMISSIONS,
      },
    });
    credentials.push({
      role: 'admin_staff',
      label: 'Supervisor',
      email: supervisorEmail,
      password: supervisorPassword,
    });

    const guardPassword = generarPassword();
    const guardEmail = emailFor('guarda');
    await prisma.user.create({
      data: {
        companyId,
        email: guardEmail,
        passwordHash: await bcrypt.hash(guardPassword, 12),
        fullName: 'Guarda Demo',
        role: 'seguridad',
        status: 'activo',
      },
    });
    credentials.push({ role: 'seguridad', label: 'Seguridad', email: guardEmail, password: guardPassword });

    const residentPassword = generarPassword();
    const residentEmail = emailFor('condomino');
    const residentUser = await prisma.user.create({
      data: {
        companyId,
        email: residentEmail,
        passwordHash: await bcrypt.hash(residentPassword, 12),
        fullName: 'Condómino Demo',
        role: 'condomino',
        status: 'activo',
      },
    });
    await withTenantContext(companyId, (tx) =>
      tx.person.update({ where: { id: condominoPersonId }, data: { userId: residentUser.id } })
    );
    credentials.push({
      role: 'condomino',
      label: 'Residente',
      email: residentEmail,
      password: residentPassword,
    });

    return { companyId, condominiumId, startedAt, expiresAt, deleteScheduledAt, credentials };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await prisma.company
      .update({
        where: { id: companyId },
        data: { blockedAt: new Date(), blockReason: 'No se pudo terminar de crear esta demo. Pedí una nueva en /demo.' },
      })
      .catch(() => undefined);
    // No se toca `demoStatus` (queda en DEMO_ACTIVO): ninguno de los 5
    // valores de `DemoStatus` describe "se creó a medias" — para eso
    // está `blockedAt` (ya cierra el paso) y esta entrada del
    // historial, que sí lo explica.
    await prisma.demoHistoryEntry
      .create({ data: { companyId, event: 'creación_fallida', detail: mensaje.slice(0, 500) } })
      .catch(() => undefined);
    throw e;
  }
}

// ============================================================
// Alta asistida por un master (PASO 3 — /master/usuarios-demo)
// ============================================================

export type MasterDemoInput = {
  /** Nombre del cliente/prospecto — identifica la cuenta en el listado. */
  clientName: string;
  /** Correo de contacto Y de acceso del usuario inicial. */
  contactEmail: string;
  phone?: string;
  condoName: string;
  /** Nombre de la persona que va a entrar como administrador. */
  initialUserFullName: string;
};

export type MasterDemoResult = {
  companyId: string;
  condominiumId: string;
  userId: string;
  email: string;
  startedAt: Date;
  expiresAt: Date;
  deleteScheduledAt: Date;
  /**
   * Enlace para que la PERSONA elija su propia contraseña — nunca se
   * genera una y se muestra en pantalla. Vence en 30 minutos y se
   * invalida solo al usarse (mismo mecanismo que "Restablecer
   * contraseña", ver `services/password-reset.ts`).
   */
  setPasswordLink: string;
};

/**
 * Alta de una demo asistida por un master, para un prospecto puntual:
 * la empresa, un condominio con SU nombre (no el genérico de /demo), y
 * UN usuario `admin_owner` — sin restricciones de `staffPermissions,
 * o sea con acceso a todos los módulos que ya tiene el rol, igual que
 * cualquier administrador real.
 *
 * A diferencia de `createDemoCompany` (autoservicio, correos con
 * sufijo aleatorio porque puede haber muchas a la vez con el mismo
 * patrón), acá el correo lo escribe el master a mano — tiene que ser
 * el correo REAL del prospecto para que reciba el enlace, así que se
 * valida que no exista ya en ningún otro usuario de la plataforma en
 * vez de mancharlo con un sufijo.
 */
export async function createMasterDemoCompany(
  master: { userId: string; userName: string },
  input: MasterDemoInput
): Promise<MasterDemoResult> {
  const email = input.contactEmail.trim().toLowerCase();
  const clientName = input.clientName.trim();
  const condoName = input.condoName.trim();
  const initialUserFullName = input.initialUserFullName.trim();
  const phone = input.phone?.trim() || null;

  if (!clientName) throw new Error('Indicá el nombre del cliente o prospecto.');
  if (!email.includes('@')) throw new Error('El correo electrónico no es válido.');
  if (!condoName) throw new Error('Indicá el nombre del condominio.');
  if (!initialUserFullName) throw new Error('Indicá el nombre del usuario inicial.');

  // El login busca por correo SOLO (ver auth.ts) — un correo repetido
  // entre dos usuarios de la plataforma hace que el más nuevo encuentre
  // la cuenta del otro. Acá se evita de raíz en vez de mancharlo con un
  // sufijo: es el correo real de un prospecto, tiene que quedar legible.
  const yaExiste = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (yaExiste) throw new Error(`Ya existe un usuario con el correo ${email}.`);

  const startedAt = new Date();
  const { expiresAt, deleteScheduledAt } = demoLifecycleDates(startedAt);

  // Contraseña de arranque: nadie la conoce, ni el master ni el
  // prospecto. El acceso se entrega con el enlace de abajo para que la
  // persona elija la suya — es el "mecanismo seguro" pedido: no hay
  // contraseña en claro que copiar, ni que viaje por un canal inseguro.
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12);

  const { companyId, userId, userPasswordHash } = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        legalName: clientName,
        tradeName: clientName,
        email,
        phone,
        isDemo: true,
        demoStatus: 'DEMO_ACTIVO',
        demoStartedAt: startedAt,
        demoExpiresAt: expiresAt,
        demoDeleteScheduledAt: deleteScheduledAt,
        demoCreatedById: master.userId,
      },
    });
    const user = await tx.user.create({
      data: {
        companyId: company.id,
        email,
        passwordHash,
        fullName: initialUserFullName,
        phone,
        role: 'admin_owner',
        status: 'activo',
      },
    });
    // Mismo motivo que en `createDemoCompany`: sin este `set_config`,
    // `ensureChartOfAccounts` lanza (RLS sin contexto), no devuelve vacío.
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_company_id', $1, true)`, company.id);
    await ensureChartOfAccounts(tx, company.id);
    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: master.userId,
        userName: `${master.userName} (master)`,
        module: 'Plataforma',
        action: 'Empresa demo creada',
        target: `${clientName} · ${email}`,
      },
    });
    // "Historial comercial": el primer evento deja el contacto completo
    // del prospecto, no solo la fecha de vencimiento.
    await tx.demoHistoryEntry.create({
      data: {
        companyId: company.id,
        event: 'creada',
        detail:
          `Cliente/prospecto: ${clientName} · contacto: ${email}` +
          (phone ? ` · tel. ${phone}` : '') +
          ` · condominio: ${condoName} · creada por ${master.userName} · vence ${expiresAt.toISOString()} · eliminación programada ${deleteScheduledAt.toISOString()}`,
        actorUserId: master.userId,
      },
    });
    return { companyId: company.id, userId: user.id, userPasswordHash: user.passwordHash };
  });

  let condominiumId: string;
  try {
    const seeded = await seedDemoCondominium(companyId, { userId, userName: initialUserFullName }, { condoName });
    condominiumId = seeded.condominiumId;
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await prisma.company
      .update({
        where: { id: companyId },
        data: { blockedAt: new Date(), blockReason: 'No se pudo terminar de crear esta demo. Contactá a soporte.' },
      })
      .catch(() => undefined);
    await prisma.demoHistoryEntry
      .create({ data: { companyId, event: 'creación_fallida', detail: mensaje.slice(0, 500), actorUserId: master.userId } })
      .catch(() => undefined);
    throw e;
  }

  const token = emitirToken(userId, userPasswordHash);
  const setPasswordLink = `${appUrl().replace(/\/$/, '')}/restablecer/${token}`;

  return { companyId, condominiumId, userId, email, startedAt, expiresAt, deleteScheduledAt, setPasswordLink };
}

/** Datos vivos de un condominio de demostración, con los mismos servicios que usa la app real. */
async function seedDemoCondominium(
  companyId: string,
  actor: { userId: string; userName: string },
  opts: { condoName?: string } = {}
): Promise<{ condominiumId: string; condominoPersonId: string }> {
  const condo = await createCondominium(companyId, actor.userId, actor.userName, {
    name: opts.condoName?.trim() || 'Residencial Demo',
    // `code` solo necesita ser único DENTRO de la empresa
    // (`@@unique([companyId, code])`) — cada demo es su propia
    // empresa, así que un valor fijo nunca choca entre demos.
    code: 'DEMO',
    type: 'residencial',
    addressLine: 'Zona demostrativa',
    province: 'San José',
    canton: 'San José',
    district: 'Carmen',
    currency: 'CRC',
    baseFee: 75000,
    dueDay: 15,
    suspensionMonths: 3,
    notes: 'Condominio de demostración — se reinicia periódicamente.',
    unitsType: 'casa',
  } as any);
  await bulkCreateProperties(companyId, condo.id, 6, 'casa');
  await activateCondominium(companyId, condo.id);

  const properties = await withTenantContext(companyId, (tx) =>
    tx.property.findMany({ where: { condominiumId: condo.id }, orderBy: { code: 'asc' } })
  );
  const unit = (n: number) => properties[n - 1]!;

  const inDays = (d: number) => {
    const date = new Date();
    date.setDate(date.getDate() + d);
    date.setHours(12, 0, 0, 0);
    return date;
  };

  // ---------- Residentes ----------
  const RESIDENTS: Array<[number, string, string, string, boolean]> = [
    [1, 'Condómino Demo', 'condomino@demo.anexypro.com', 'propietario', true],
    [2, 'Marcela Umaña Rojas', 'marcela.demo@anexypro.com', 'propietario', true],
    [3, 'Esteban Solano Vega', 'esteban.demo@anexypro.com', 'propietario', true],
    [4, 'Kimberly Araya Mora', 'kimberly.demo@anexypro.com', 'propietario', true],
    [5, 'Rodrigo Chinchilla Bran', 'rodrigo.demo@anexypro.com', 'inquilino', true],
    [6, 'Andrea Fallas Céspedes', 'andrea.demo@anexypro.com', 'propietario', true],
  ];
  let condominoPersonId = '';
  for (const [n, fullName, email, role, isPrimary] of RESIDENTS) {
    const person = await addPersonToProperty(companyId, unit(n).id, { fullName, email, role, isPrimary });
    if (n === 1) condominoPersonId = person.id;
  }

  // ---------- Finanzas: cuota del mes + pagos (una unidad queda morosa) ----------
  await generateOrdinaryBilling(companyId, condo.id, new Date());
  const pay = (n: number, ref: string) =>
    makePayment(
      companyId,
      { condominiumId: condo.id, propertyId: unit(n).id, amount: 75000, method: 'sinpe', reference: ref },
      actor.userId,
      actor.userName
    );
  for (let n = 1; n <= 5; n++) await pay(n, `DEMO-${n}`);
  // La unidad 6 no paga — muestra morosidad y el estado "en atraso".

  // ---------- Áreas comunes y reservas ----------
  const piscina = await createAmenity(companyId, {
    condominiumId: condo.id,
    name: 'Piscina',
    capacity: 20,
    reservationCost: 0,
    requiresApproval: false,
  });
  const salon = await createAmenity(companyId, {
    condominiumId: condo.id,
    name: 'Salón de eventos',
    capacity: 40,
    reservationCost: 20000,
    requiresApproval: true,
  });
  await createReservation(companyId, {
    condominiumId: condo.id,
    amenityId: piscina.id,
    propertyId: unit(2).id,
    resDate: inDays(2),
    startsAt: '10:00',
    endsAt: '12:00',
  });
  await createReservation(companyId, {
    condominiumId: condo.id,
    amenityId: salon.id,
    propertyId: unit(4).id,
    resDate: inDays(6),
    startsAt: '17:00',
    endsAt: '22:00',
  }); // queda pendiente de aprobación — muestra la bandeja de reservas

  // ---------- Visitas ----------
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const v1 = await createVisit(companyId, actor.userId, actor.userName, true, {
    condominiumId: condo.id,
    propertyId: unit(1).id,
    visitType: 'rapida',
    visitorName: 'Visita de ejemplo',
    validDate: today,
  });
  await checkIn(companyId, v1.id, { userId: actor.userId, userName: actor.userName }); // adentro ahora mismo
  await createVisit(companyId, actor.userId, actor.userName, true, {
    condominiumId: condo.id,
    propertyId: unit(3).id,
    visitType: 'entrega',
    visitorName: 'Mensajería demo',
    courier: 'Correos de ejemplo',
    validDate: inDays(1),
  });

  // ---------- Seguridad ----------
  await createIncident(companyId, actor.userId, {
    condominiumId: condo.id,
    category: 'convivencia',
    title: 'Ejemplo: ruido después de las 10 pm',
    description: 'Incidente de demostración para mostrar el módulo de seguridad.',
  });

  // ---------- Proyectos ----------
  const proyecto = await createProject(companyId, actor.userId, actor.userName, {
    condominiumId: condo.id,
    name: 'Renovación del área social',
    description: 'Proyecto de demostración con hitos y avance.',
    budget: 3500000,
    startDate: inDays(-15),
  });
  await setProjectStatus(companyId, proyecto.id, 'en_progreso');
  const hito = await addMilestone(companyId, proyecto.id, 'Diseño aprobado', inDays(-5));
  await toggleMilestone(companyId, hito.id, true);
  await addMilestone(companyId, proyecto.id, 'Ejecución de obra', inDays(20));

  // ---------- Comunicados ----------
  const comunicado = await createCommunication(companyId, actor.userId, actor.userName, {
    condominiumId: condo.id,
    title: 'Bienvenido al condominio de demostración',
    category: 'noticia',
    body: 'Este es un comunicado de ejemplo para que veas cómo se ven los avisos en el portal del residente.',
    targetType: 'todos',
  });
  await publishCommunication(companyId, actor.userId, actor.userName, comunicado.id);

  return { condominiumId: condo.id, condominoPersonId };
}

// ============================================================
// Consulta
// ============================================================

/**
 * PASO 11 — historial comercial permanente. Estos 15 campos son
 * EXACTAMENTE los que tienen que sobrevivir aunque la demo termine
 * `DEMO_ELIMINADO` (PASO 9 borra `storage_folders`/`storage_objects`,
 * nunca la fila de `companies` ni `demo_history_entries`). A propósito
 * NO incluye nada operativo (residentes, cargos, reservas…) ni
 * archivos: es una ficha comercial, no un respaldo del condominio.
 */
export type DemoSummary = {
  companyId: string;
  /** `false` desde el momento exacto en que se convierte — la fila sigue en este listado por `demoStatus`. */
  isDemo: boolean;
  /** "Cliente/prospecto" — el nombre visible de la cuenta. */
  legalName: string;
  tradeName: string | null;
  /** Correo de contacto. NULL en el alta anónima de /demo (no hay a quién contactar). */
  email: string | null;
  /** Teléfono de contacto. NULL en el alta anónima de /demo. */
  phone: string | null;
  demoStatus: DemoStatus | null;
  /** Fecha de creación de la fila (siempre existe, a diferencia de `demoStartedAt`). */
  createdAt: Date;
  demoStartedAt: Date | null;
  demoExpiresAt: Date | null;
  demoDeleteScheduledAt: Date | null;
  /** Cuándo `purgeDemoDriveFiles` (PASO 9) terminó de borrar sus archivos. NULL = nunca se purgó. */
  demoDeletedAt: Date | null;
  demoCreatedById: string | null;
  /** Resuelto aparte porque `demoCreatedById` es solo el id. */
  demoCreatedByName: string | null;
  /** "¿Fue convertida?" — no se infiere de `demoStatus` a la vista: se dice explícito. */
  wasConverted: boolean;
  demoConvertedAt: Date | null;
  demoConvertedById: string | null;
  /** Resuelto aparte porque `demoConvertedById` es solo el id. */
  demoConvertedByName: string | null;
  /** Plan adquirido AL CONVERTIR — foto fija, no el plan vigente hoy. */
  demoConvertedPlanName: string | null;
  /** Observaciones comerciales — el único campo de este tipo editable después de escrito. */
  demoCommercialNotes: string | null;
  /** Nombre del condominio sembrado, o `null` si todavía no tiene uno. */
  condominiumName: string | null;
  blockedAt: Date | null;
};

const DEMO_SUMMARY_SELECT = {
  id: true,
  isDemo: true,
  legalName: true,
  tradeName: true,
  email: true,
  phone: true,
  demoStatus: true,
  demoStartedAt: true,
  demoExpiresAt: true,
  demoDeleteScheduledAt: true,
  demoConvertedAt: true,
  demoConvertedById: true,
  demoConvertedPlanName: true,
  demoCommercialNotes: true,
  demoDeletedAt: true,
  demoCreatedById: true,
  blockedAt: true,
  createdAt: true,
} as const;

type DemoRow = {
  id: string;
  isDemo: boolean;
  legalName: string;
  tradeName: string | null;
  email: string | null;
  phone: string | null;
  demoStatus: DemoStatus | null;
  demoStartedAt: Date | null;
  demoExpiresAt: Date | null;
  demoDeleteScheduledAt: Date | null;
  demoConvertedAt: Date | null;
  demoConvertedById: string | null;
  demoConvertedPlanName: string | null;
  demoCommercialNotes: string | null;
  demoDeletedAt: Date | null;
  demoCreatedById: string | null;
  blockedAt: Date | null;
  createdAt: Date;
};

/**
 * Completa cada fila con el nombre de su condominio (RLS: un viaje por
 * empresa, no hay forma de traerlo todos juntos sin salirse del
 * aislamiento) y el nombre de quién la creó/convirtió (`users` no lleva
 * RLS, esos sí salen en una sola consulta). Pensada para listados
 * chicos —el panel de un master, no un reporte masivo.
 */
async function toSummaries(rows: DemoRow[]): Promise<DemoSummary[]> {
  const userIds = [
    ...new Set(
      rows.flatMap((r) => [r.demoCreatedById, r.demoConvertedById]).filter((x): x is string => !!x)
    ),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
    : [];
  const userName = new Map(users.map((u) => [u.id, u.fullName]));

  const condoNames = await Promise.all(
    rows.map((r) =>
      withTenantContext(r.id, (tx) => tx.condominium.findFirst({ where: { companyId: r.id }, select: { name: true } }))
    )
  );

  return rows.map((row, i) => ({
    companyId: row.id,
    isDemo: row.isDemo,
    legalName: row.legalName,
    tradeName: row.tradeName,
    email: row.email,
    phone: row.phone,
    demoStatus: row.demoStatus,
    createdAt: row.createdAt,
    demoStartedAt: row.demoStartedAt,
    demoExpiresAt: row.demoExpiresAt,
    demoDeleteScheduledAt: row.demoDeleteScheduledAt,
    demoDeletedAt: row.demoDeletedAt,
    demoCreatedById: row.demoCreatedById,
    demoCreatedByName: row.demoCreatedById ? (userName.get(row.demoCreatedById) ?? null) : null,
    wasConverted: row.demoConvertedAt !== null,
    demoConvertedAt: row.demoConvertedAt,
    demoConvertedById: row.demoConvertedById,
    demoConvertedByName: row.demoConvertedById ? (userName.get(row.demoConvertedById) ?? null) : null,
    demoConvertedPlanName: row.demoConvertedPlanName,
    demoCommercialNotes: row.demoCommercialNotes,
    condominiumName: condoNames[i]?.name ?? null,
    blockedAt: row.blockedAt,
  }));
}

/**
 * Lista las empresas demo, más nuevas primero. `companies` no lleva
 * RLS (igual que el resto de las funciones de plataforma), así que se
 * consulta directo — lo protege que solo se llama desde pantallas que
 * exigen rol master.
 *
 * PASO 11 — filtra por `demoStatus: { not: null }`, NO por `isDemo`.
 * `isDemo` pasa a `false` en el momento exacto de convertir
 * (`convertDemoToFormal`): filtrar por ahí haría que una cuenta
 * convertida desapareciera de este listado justo cuando el historial
 * comercial tiene que seguir disponible. `demoStatus`, en cambio, se
 * fija al crear la demo y NUNCA vuelve a `null` — ni al convertir
 * (`DEMO_CONVERTIDO`) ni al purgar (`DEMO_ELIMINADO`) — así que es el
 * filtro correcto para "toda empresa que alguna vez fue una demo".
 */
export async function listDemoCompanies(filter: { status?: DemoStatus } = {}): Promise<DemoSummary[]> {
  const rows = await prisma.company.findMany({
    where: { demoStatus: filter.status ?? { not: null } },
    orderBy: { createdAt: 'desc' },
    select: DEMO_SUMMARY_SELECT,
  });
  return toSummaries(rows);
}

/**
 * Ficha de una demo puntual (activa, vencida, convertida o eliminada),
 * o `null` si ese id nunca fue una demo. Mismo criterio de PASO 11 que
 * `listDemoCompanies`: por `demoStatus`, no por `isDemo`.
 */
export async function getDemoDetail(companyId: string): Promise<DemoSummary | null> {
  const row = await prisma.company.findFirst({
    where: { id: companyId, demoStatus: { not: null } },
    select: DEMO_SUMMARY_SELECT,
  });
  if (!row) return null;
  const [summary] = await toSummaries([row]);
  return summary!;
}

export type DemoHistoryRow = {
  id: string;
  event: string;
  detail: string | null;
  occurredAt: Date;
  actorUserId: string | null;
  /** Resuelto aparte porque `actorUserId` es solo el id; `null` si lo generó un proceso automático. */
  actorName: string | null;
};

/**
 * Historial completo de una demo, más reciente primero — la línea de
 * tiempo auditable que pide PASO 11 (crear, reactivar, vencer,
 * convertir, iniciar/completar/fallar limpieza…), cada evento con quién
 * lo disparó y cuándo.
 */
export async function getDemoHistory(companyId: string): Promise<DemoHistoryRow[]> {
  const rows = await prisma.demoHistoryEntry.findMany({
    where: { companyId },
    orderBy: { occurredAt: 'desc' },
    select: { id: true, event: true, detail: true, occurredAt: true, actorUserId: true },
  });
  const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } })
    : [];
  const actorName = new Map(actors.map((a) => [a.id, a.fullName]));
  return rows.map((r) => ({ ...r, actorName: r.actorUserId ? (actorName.get(r.actorUserId) ?? null) : null }));
}

/**
 * PASO 11 — "Observaciones comerciales": el único campo del historial
 * permanente pensado para cambiar después de escrito (todos los demás
 * son hechos de una sola vez: fechas, quién creó, quién convirtió).
 * Cualquier master lo puede editar en cualquier momento del ciclo de
 * vida de la demo — incluso ya `DEMO_ELIMINADO` o `DEMO_CONVERTIDO`,
 * porque es información de venta, no del condominio.
 *
 * No genera una fila de `DemoHistoryEntry` por cada edición a propósito:
 * es un campo vivo tipo "notas", no un evento del ciclo de vida — su
 * propio historial de cambios sería ruido operativo, justo lo que PASO
 * 11 pide NO conservar.
 */
export async function updateDemoCommercialNotes(companyId: string, notes: string): Promise<void> {
  const company = await prisma.company.findFirst({ where: { id: companyId, demoStatus: { not: null } }, select: { id: true } });
  if (!company) throw new Error('Esa empresa nunca fue una demo.');
  await prisma.company.update({
    where: { id: companyId },
    data: { demoCommercialNotes: notes.trim().slice(0, 4000) || null },
  });
}

// ============================================================
// Conversión a cuenta formal (PASO 6 — exclusiva del master)
// ============================================================

export type ConvertirDemoInput = {
  planId: string;
  /** "Próxima fecha de pago" que arranca la suscripción real. */
  firstPaymentDate: Date;
};

export type ConvertirDemoResultado = {
  companyId: string;
  convertedAt: Date;
  planName: string;
  nextPaymentDate: Date;
  /** Estado de la suscripción justo después de convertir (normalmente "al_dia"). */
  estadoFinal: string;
  /**
   * Carpeta de Google Drive (o del proveedor activo) que traía la demo,
   * CONSERVADA tal cual — PASO 10 no la toca ni la recrea. `null` si la
   * demo nunca llegó a crear una (nada que conservar).
   */
  carpetaDriveConservada: { id: string; name: string } | null;
};

/**
 * Convierte una demo en cuenta formal — EN LA MISMA fila de `Company`.
 *
 * No crea una empresa nueva, ni un condominio nuevo, ni usuarios
 * nuevos: el condominio, los residentes, los usuarios, los documentos,
 * las imágenes, los comunicados, las reservas, los mantenimientos y
 * las configuraciones YA VIVEN en esta empresa — convertir es
 * simplemente dejar de tratarla como demo. Es la misma garantía que
 * sostiene todo el aislamiento multi-tenant: una `Company` es una
 * `Company`, "demo" es solo una etiqueta encima.
 *
 * `isDemo: false` es el cambio que de verdad importa — es lo único que
 * miran `providerForCompany` (deja de forzar el proveedor `local`;
 * los archivos YA subidos no se tocan, cada uno recuerda su propio
 * proveedor — ver `services/storage.ts`), `authorize()`/`guard.ts`
 * (deja de aplicar el bloqueo específico de demo) y los 4 jobs
 * financieros reales (`facturacion-automatica`, `interes-moratorio`,
 * `cobranza`, `informe-mensual`, que hoy la excluyen con
 * `includeDemo:false`) — a partir de acá empiezan a incluirla, que es
 * justo lo que necesita un cliente de pago.
 *
 * "Plan contratado" reutiliza `assignPlan` tal cual, NO se reinventa:
 * mismo campo `Company.planId`, misma forma de fijar
 * `nextPaymentDate`/`subscriptionStartedAt` que ya usa
 * `/master/suscripciones`.
 */
export async function convertDemoToFormal(
  companyId: string,
  master: { userId: string; userName: string },
  input: ConvertirDemoInput
): Promise<ConvertirDemoResultado> {
  const company = await prisma.company.findFirst({
    where: { id: companyId, isDemo: true },
    select: { id: true, demoStatus: true, demoDriveFolderId: true, demoDriveFolderName: true },
  });
  if (!company) throw new Error('Esa empresa no es una demo.');
  if (company.demoStatus !== 'DEMO_ACTIVO' && company.demoStatus !== 'DEMO_VENCIDO') {
    throw new Error('Esta demo ya no se puede convertir (no está activa ni vencida).');
  }

  // PASO 10 — lo que se va a CONSERVAR, para dejarlo registrado explícito
  // más abajo. No se lee de nuevo después de convertir: la fila de acá
  // es la prueba de que la conversión no la tocó.
  const carpetaDriveConservada = company.demoDriveFolderId
    ? { id: company.demoDriveFolderId, name: company.demoDriveFolderName ?? company.demoDriveFolderId }
    : null;

  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: input.planId }, select: { id: true, name: true, graceDays: true } });
  if (!plan) throw new Error('El plan no existe.');

  const convertedAt = new Date();
  const estado = subscriptionState(
    { planId: plan.id, nextPaymentDate: input.firstPaymentDate, blockedAt: null, graceDays: plan.graceDays },
    convertedAt
  );

  // PASO 10 — el `data:` de abajo NO incluye ninguno de los tres campos
  // `demoDriveFolder*` ni toca `storage_folders`/`storage_objects`: la
  // carpeta de Drive y sus archivos quedan EXACTAMENTE como estaban,
  // porque la conversión ocurre en la MISMA fila de `Company` (mismo
  // `id` = mismo tenant/demo id) y ninguna de estas dos tablas guarda
  // nada por fuera de `companyId`/`condominiumId`. No hay descarga ni
  // resubida ni copia: cero llamadas al proveedor de almacenamiento en
  // toda esta función.
  await prisma.company.update({
    where: { id: companyId },
    data: {
      // El cambio real: deja de comportarse como demo en todo el sistema.
      isDemo: false,
      // Historial de dónde vino esta cuenta — no se borra.
      demoStatus: 'DEMO_CONVERTIDO',
      demoConvertedAt: convertedAt,
      // PASO 11 — historial comercial permanente: quién convirtió y qué
      // plan se llevó, como FOTO FIJA (si más tarde un master le cambia
      // el plan desde /master/suscripciones, `planId` cambia pero
      // `demoConvertedPlanName` NO — sigue diciendo qué vendió esta
      // conversión).
      demoConvertedById: master.userId,
      demoConvertedPlanName: plan.name,
      // "Cancelar cualquier proceso de eliminación programado" es esto:
      // sin `demoExpiresAt`/`demoDeleteScheduledAt`, `demo-vencidos` no
      // la vuelve a marcar y `evaluatePurgeEligibility`
      // (domain/demo-cleanup.ts, PASO 9) la rechaza de entrada por
      // `demoStatus === 'DEMO_CONVERTIDO'` — dos capas, no una sola.
      demoExpiresAt: null,
      demoDeleteScheduledAt: null,
      // Por si venía de DEMO_VENCIDO (bloqueada): se levanta el paso,
      // igual que hace `reactivateDemo`.
      blockedAt: null,
      blockReason: null,
      // "Plan contratado" — mismos campos que usa `assignPlan` en
      // services/subscriptions.ts, para que `subscriptionState()` la
      // trate exactamente igual que a cualquier empresa real.
      planId: plan.id,
      nextPaymentDate: input.firstPaymentDate,
      subscriptionStartedAt: input.firstPaymentDate,
    },
  });

  // "Registrar" — los 6 datos pedidos, todos en el mismo detalle
  // legible (sin columnas nuevas en `Company`, mismo criterio que
  // `reactivateDemo`): fecha/hora → `occurredAt`; usuario master →
  // `actorUserId` + el nombre en el texto; cuenta DEMO original Y
  // cuenta formal resultante → el MISMO `companyId` (se dice explícito
  // que es la misma fila, no una empresa nueva); carpeta de Drive
  // conservada → `carpetaDriveConservada`; plan contratado → `plan.name`.
  const detalle =
    `Convertida a cuenta formal por ${master.userName} · ` +
    `cuenta DEMO original y cuenta formal resultante: la MISMA empresa (id ${companyId}, no se creó una nueva) · ` +
    `carpeta de Drive conservada: ${
      carpetaDriveConservada
        ? `"${carpetaDriveConservada.name}" (id ${carpetaDriveConservada.id})`
        : 'sin carpeta creada todavía — nada que conservar'
    } · plan contratado: ${plan.name} · próximo pago ${input.firstPaymentDate.toISOString().slice(0, 10)} · ` +
    `estado final: ${estado.status}`;
  await prisma.demoHistoryEntry.create({
    data: { companyId, event: 'convertida_formal', detail: detalle, actorUserId: master.userId },
  });

  // Auditoría: mismo mecanismo que `demo-vencidos` y `reactivateDemo`
  // (módulo "Suscripción" en `audit_log`, que sí lleva RLS).
  await withTenantContext(companyId, (tx) =>
    tx.auditLog.create({
      data: {
        companyId,
        userId: master.userId,
        userName: `${master.userName} (master)`,
        module: 'Suscripción',
        action: 'Convertida a cuenta formal',
        target:
          `Plan ${plan.name} · próximo pago ${input.firstPaymentDate.toISOString().slice(0, 10)} · ` +
          `carpeta de Drive conservada: ${carpetaDriveConservada ? carpetaDriveConservada.name : 'ninguna'}`,
      },
    })
  ).catch(() => undefined);

  return {
    companyId,
    convertedAt,
    planName: plan.name,
    nextPaymentDate: input.firstPaymentDate,
    estadoFinal: estado.status,
    carpetaDriveConservada,
  };
}

// ============================================================
// Reactivación (PASO 5 — exclusiva del master, solo DEMO_VENCIDO)
// ============================================================

/**
 * Reactiva una demo vencida: vuelve a `DEMO_ACTIVO`, LEVANTA el
 * bloqueo (`blockedAt`/`blockReason` — sin esto `demoStatus` diría
 * "activa" pero `authorize()` y `guard.ts` seguirían rechazando el
 * acceso, porque los dos revisan `blockedAt`, no `demoStatus`), y le
 * da un ciclo de 15/18 días NUEVO contado desde AHORA — la misma
 * política de `demoLifecycleDates` que se usa al crear una demo, no
 * una inventada aparte: reactivar es, para efectos de fechas, "volver
 * a empezar".
 *
 * Quién puede llamarla: la protege el `guardMaster()` de
 * `app/master/usuarios-demo/actions.ts`, NO esta función — pero acá
 * también se exige `demoStatus === 'DEMO_VENCIDO'` por su cuenta
 * (nunca confiar en que el llamador ya lo comprobó), así que ni una
 * demo activa ni una convertida ni una empresa real se pueden
 * "reactivar" con esta función así se la invoque directo.
 */
export async function reactivateDemo(
  companyId: string,
  master: { userId: string; userName: string }
): Promise<DemoSummary> {
  const company = await prisma.company.findFirst({
    where: { id: companyId, isDemo: true },
    select: { id: true, demoStatus: true },
  });
  if (!company) throw new Error('Esa empresa no es una demo.');
  if (company.demoStatus !== 'DEMO_VENCIDO') {
    throw new Error('Solo se puede reactivar una demo vencida (DEMO_VENCIDO).');
  }

  // Hora del SERVIDOR — el nuevo ciclo de la demo arranca de acá, no
  // de lo que mande el navegador de quien la reactiva.
  const reactivatedAt = new Date();
  const { expiresAt, deleteScheduledAt } = demoLifecycleDates(reactivatedAt);

  await prisma.company.update({
    where: { id: companyId },
    data: {
      demoStatus: 'DEMO_ACTIVO',
      demoStartedAt: reactivatedAt,
      demoExpiresAt: expiresAt,
      demoDeleteScheduledAt: deleteScheduledAt,
      blockedAt: null,
      blockReason: null,
    },
  });

  // "Historial de la demo": fecha/hora y quién la reactivó quedan acá
  // (`occurredAt` + `actorUserId`) — no hacía falta una columna nueva
  // en `Company` para lo mismo que este modelo ya registra.
  await prisma.demoHistoryEntry.create({
    data: {
      companyId,
      event: 'reactivada',
      detail:
        `Reactivada por ${master.userName} · nuevo vencimiento ${expiresAt.toISOString()} · ` +
        `nueva eliminación programada ${deleteScheduledAt.toISOString()}`,
      actorUserId: master.userId,
    },
  });

  // Auditoría: mismo mecanismo que ya usa `demo-vencidos` (job) y
  // `blockCompany` (bloqueo manual) — módulo "Suscripción" en
  // `audit_log`, que sí lleva RLS.
  await withTenantContext(companyId, (tx) =>
    tx.auditLog.create({
      data: {
        companyId,
        userId: master.userId,
        userName: `${master.userName} (master)`,
        module: 'Suscripción',
        action: 'Demo reactivada',
        target: `Nuevo vencimiento ${expiresAt.toISOString()}`,
      },
    })
  ).catch(() => undefined);

  const detalle = await getDemoDetail(companyId);
  return detalle!;
}
