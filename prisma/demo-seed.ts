/**
 * Datos de DEMOSTRACIÓN — crea "Residencial Altamar (Demo)" con datos
 * vivos en todos los módulos, usando los MISMOS servicios de la app
 * (facturación con devengo contable, pagos al cargo más antiguo,
 * tickets con costo → asiento, gastos de proyecto → asiento, etc.).
 *
 * Ejecutar:   npx tsx prisma/demo-seed.ts
 * Re-ejecutable: cada sección se salta si ya tiene datos.
 *
 * Usuarios demo que crea (contraseñas para grabación/presentación):
 *   Residente:  laura@demo.anexypro.com  / DemoResidente2026!
 *   Seguridad:  guarda@demo.anexypro.com / DemoGuarda2026!
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { folderBySlug, uploadToFolder } from '../src/lib/services/storage';

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirstOrThrow();
  const admin = await prisma.user.findFirstOrThrow({ where: { companyId: company.id, role: 'admin_owner' } });
  const companyId = company.id;
  const actor = { userId: admin.id, userName: admin.fullName };

  const { createCondominium, activateCondominium, seedCondoCatalogs } = await import('../src/lib/services/condominiums');
  const { bulkCreateProperties, addPersonToProperty, addVehicle, addPet } = await import('../src/lib/services/properties');
  const { generateOrdinaryBilling, makePayment } = await import('../src/lib/services/finance');
  const { createAmenity } = await import('../src/lib/services/amenities');
  const { createReservation, decideReservation } = await import('../src/lib/services/reservations');
  const { createVisit, checkIn, checkOut } = await import('../src/lib/services/visits');
  const { createIncident, setIncidentStatus, receivePackage, deliverPackage } = await import('../src/lib/services/security');
  const { createAsset, listAssetCategories, createProvider, createTicket, updateTicketStatus, completeTicket } = await import('../src/lib/services/maintenance');
  const { createProject, setProjectStatus, addMilestone, toggleMilestone, addExpense } = await import('../src/lib/services/projects');
  const { createCommunication, publishCommunication } = await import('../src/lib/services/communications');
  const { createContentItem } = await import('../src/lib/services/content');
  const { createAssembly, openVote } = await import('../src/lib/services/assemblies');
  const { createDocument, setDocumentBodyText } = await import('../src/lib/services/documents');

  // ---------- Condominio ----------
  let condo = await prisma.condominium.findFirst({ where: { companyId, name: { contains: 'Altamar' } } });
  if (!condo) {
    console.log('Creando condominio demo…');
    condo = await createCondominium(companyId, actor.userId, actor.userName, {
      name: 'Residencial Altamar (Demo)',
      code: 'ALTA',
      type: 'residencial',
      addressLine: 'La Guácima, Alajuela',
      province: 'Alajuela',
      canton: 'Alajuela',
      district: 'La Guácima',
      currency: 'CRC',
      baseFee: 75000,
      dueDay: 15,
      suspensionMonths: 3,
      notes: 'Condominio de demostración',
      unitsType: 'casa',
    } as any);
    await bulkCreateProperties(companyId, condo.id, 16, 'casa');
    await activateCondominium(companyId, condo.id);
  } else {
    console.log('Condominio demo ya existe — completando secciones faltantes…');
  }
  const condoId = condo.id;
  const properties = await prisma.property.findMany({ where: { condominiumId: condoId }, orderBy: { code: 'asc' } });
  const unit = (n: number) => properties[n - 1]!; // CASA-01 → unit(1)

  const inDays = (d: number) => {
    const date = new Date();
    date.setDate(date.getDate() + d);
    date.setHours(12, 0, 0, 0);
    return date;
  };

  // ---------- Residentes ----------
  if ((await prisma.propertyMember.count({ where: { property: { condominiumId: condoId } } })) === 0) {
    console.log('Creando residentes…');
    const RESIDENTS: Array<[number, string, string, string]> = [
      [1, 'Laura Jiménez Mora', 'laura@demo.anexypro.com', 'propietario'],
      [1, 'Diego Chaves Solano', 'diego@demo.anexypro.com', 'residente'],
      [2, 'Carmen Rodríguez Vega', 'carmen@demo.anexypro.com', 'propietario'],
      [3, 'Luis Araya Castro', 'luis@demo.anexypro.com', 'propietario'],
      [4, 'Sofía Herrera Blanco', 'sofia@demo.anexypro.com', 'propietario'],
      [5, 'Marco Vindas León', 'marco@demo.anexypro.com', 'propietario'],
      [6, 'Ana Salas Quirós', 'ana@demo.anexypro.com', 'propietario'],
      [7, 'Jorge Campos Rojas', 'jorge@demo.anexypro.com', 'inquilino'],
      [8, 'Patricia Núñez Solís', 'patricia@demo.anexypro.com', 'propietario'],
      [9, 'Ricardo Monge Pérez', 'ricardo@demo.anexypro.com', 'propietario'],
      [10, 'Gabriela Fallas Umaña', 'gabriela@demo.anexypro.com', 'propietario'],
      [11, 'Esteban Cordero Mata', 'esteban@demo.anexypro.com', 'propietario'],
      [12, 'Viviana Brenes Aguilar', 'viviana@demo.anexypro.com', 'propietario'],
    ];
    for (const [n, fullName, email, role] of RESIDENTS) {
      await addPersonToProperty(companyId, unit(n).id, {
        fullName,
        email,
        phone: `8${String(7000 + n * 13).padStart(3, '0')}-${String(1000 + n * 71).slice(0, 4)}`,
        role,
        isPrimary: role === 'propietario',
      });
    }
    await addVehicle(companyId, unit(1).id, { plate: 'BQR-482', brand: 'Toyota', model: 'Corolla Cross', color: 'Gris', vehicleType: 'automovil' });
    await addVehicle(companyId, unit(2).id, { plate: 'CLM-917', brand: 'Hyundai', model: 'Tucson', color: 'Blanco', vehicleType: 'automovil' });
    await addVehicle(companyId, unit(5).id, { plate: 'MOT-334', brand: 'Yamaha', model: 'FZ', color: 'Negro', vehicleType: 'motocicleta' });
    await addPet(companyId, unit(1).id, { name: 'Rocky', species: 'perro', breed: 'Golden Retriever' });
    await addPet(companyId, unit(4).id, { name: 'Misifu', species: 'gato', breed: 'Criollo' });
  }

  // ---------- Finanzas: 3 meses de facturación + pagos ----------
  if ((await prisma.feeBatch.count({ where: { condominiumId: condoId } })) === 0) {
    console.log('Facturando 3 periodos…');
    await generateOrdinaryBilling(companyId, condoId, new Date('2026-05-01T12:00:00'));
    await generateOrdinaryBilling(companyId, condoId, new Date('2026-06-01T12:00:00'));
    await generateOrdinaryBilling(companyId, condoId, new Date('2026-07-01T12:00:00'));
  }
  if ((await prisma.payment.count({ where: { condominiumId: condoId } })) === 0) {
    console.log('Registrando pagos…');
    const pay = (n: number, amount: number, method: string, ref: string) =>
      makePayment(companyId, { condominiumId: condoId, propertyId: unit(n).id, amount, method, reference: ref }, actor.userId, actor.userName);
    for (let n = 1; n <= 11; n++) await pay(n, 225000, n % 2 ? 'transferencia' : 'sinpe', `TRF-2026-${1000 + n}`);
    await pay(12, 75000, 'transferencia', 'TRF-2026-1012');
    await pay(13, 75000, 'efectivo', 'REC-2026-1013');
    // 14 no paga — morosidad de 3 meses (servicios suspendidos).
    await pay(15, 225000, 'transferencia', 'TRF-2026-1015');
    await pay(16, 225000, 'sinpe', 'SNP-2026-1016');
  }

  // ---------- Comprobante e imagen de activo de ejemplo ----------
  // Van al repositorio privado, no a `public/`: si el sembrado escribiera
  // en la carpeta pública volvería a exponer archivos con solo conocer
  // la URL, que es justo lo que la migración vino a cerrar.
  const demoBytes = fs.readFileSync(path.join(process.cwd(), 'public', 'login-blueprint.jpg'));
  const seedActor = { role: 'master', companyId };
  const intoRepo = async (slug: string, fileName: string) => {
    const folder = await folderBySlug(companyId, condoId, slug);
    const stored = await uploadToFolder(seedActor, {
      folderId: folder.id,
      fileName,
      mimeType: 'image/jpeg',
      data: demoBytes,
      userName: 'Datos de demostración',
    });
    return `/api/archivo/${stored.id}`;
  };
  const demoReceipt = await intoRepo('seguridad/reservas', 'demo-comprobante.jpg');
  const demoAssetPhoto = await intoRepo('multimedia/fotografias', 'demo-activo.jpg');

  // ---------- Áreas comunes y reservas ----------
  if ((await prisma.amenity.count({ where: { condominiumId: condoId } })) === 0) {
    console.log('Creando áreas comunes…');
    await createAmenity(companyId, { condominiumId: condoId, name: 'Rancho BBQ', capacity: 30, reservationCost: 15000, requiresApproval: true });
    await createAmenity(companyId, { condominiumId: condoId, name: 'Piscina', capacity: 25, reservationCost: 0, requiresApproval: false });
    await createAmenity(companyId, { condominiumId: condoId, name: 'Gimnasio', capacity: 12, reservationCost: 0, requiresApproval: false });
  }
  if ((await prisma.reservation.count({ where: { condominiumId: condoId } })) === 0) {
    console.log('Creando reservas…');
    const rancho = await prisma.amenity.findFirstOrThrow({ where: { condominiumId: condoId, name: 'Rancho BBQ' } });
    const piscina = await prisma.amenity.findFirstOrThrow({ where: { condominiumId: condoId, name: 'Piscina' } });
    const r1 = await createReservation(companyId, {
      condominiumId: condoId, amenityId: rancho.id, propertyId: unit(1).id,
      resDate: inDays(5), startsAt: '11:00', endsAt: '16:00', receiptUrl: demoReceipt,
    });
    await decideReservation(companyId, actor.userId, { reservationId: r1.id, decision: 'confirmada' });
    await createReservation(companyId, {
      condominiumId: condoId, amenityId: rancho.id, propertyId: unit(4).id,
      resDate: inDays(9), startsAt: '10:00', endsAt: '14:00', receiptUrl: demoReceipt,
    }); // pendiente de aprobación, con comprobante
    await createReservation(companyId, {
      condominiumId: condoId, amenityId: piscina.id, propertyId: unit(6).id,
      resDate: inDays(2), startsAt: '09:00', endsAt: '11:00',
    }); // sin costo → confirmada automática
  }

  // ---------- Visitas (se regeneran si quedaron a medias) ----------
  console.log('Creando visitas…');
  await prisma.visitCheckin.deleteMany({ where: { authorization: { condominiumId: condoId } } });
  await prisma.visitAuthorization.deleteMany({ where: { condominiumId: condoId } });
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const v1 = await createVisit(companyId, actor.userId, actor.userName, true, {
    condominiumId: condoId, propertyId: unit(2).id, visitType: 'rapida', visitorName: 'Fernanda Ulate', validDate: today,
  });
  await checkIn(companyId, v1.id, { userId: actor.userId, userName: actor.userName });
  const c1 = await prisma.visitCheckin.findFirstOrThrow({ where: { authorizationId: v1.id } });
  await checkOut(companyId, c1.id); // completada → historial
  const v2 = await createVisit(companyId, actor.userId, actor.userName, true, {
    condominiumId: condoId, propertyId: unit(3).id, visitType: 'rapida', visitorName: 'Pablo Segura', vehiclePlate: 'SJB-201', validDate: today,
  });
  await checkIn(companyId, v2.id, { userId: actor.userId, userName: actor.userName }); // adentro ahora mismo
  await createVisit(companyId, actor.userId, actor.userName, true, {
    condominiumId: condoId, propertyId: unit(1).id, visitType: 'entrega', visitorName: 'Mensajería Zoom', courier: 'Zoom Express', validDate: today,
  });
  await createVisit(companyId, actor.userId, actor.userName, true, {
    condominiumId: condoId, propertyId: unit(5).id, visitType: 'rapida', visitorName: 'Karla Espinoza', validDate: inDays(1),
  });

  // ---------- Seguridad ----------
  if ((await prisma.incident.count({ where: { condominiumId: condoId } })) === 0) {
    console.log('Creando incidentes y paquetería…');
    const inc1 = await createIncident(companyId, actor.userId, { condominiumId: condoId, category: 'seguridad', title: 'Portón principal quedó abierto', description: 'Reportado por oficial en ronda nocturna.' });
    await setIncidentStatus(companyId, inc1.id, 'cerrado');
    await createIncident(companyId, actor.userId, { condominiumId: condoId, category: 'convivencia', title: 'Ruido excesivo en área de piscina', description: 'Vecinos reportan música a alto volumen después de las 10 pm.' });
    const pkg1 = await receivePackage(companyId, actor.userId, { condominiumId: condoId, propertyId: unit(1).id, courier: 'Correos de Costa Rica', description: 'Caja mediana' });
    await deliverPackage(companyId, pkg1.id, actor.userId);
    await receivePackage(companyId, actor.userId, { condominiumId: condoId, propertyId: unit(8).id, courier: 'DHL', description: 'Sobre documentos' });
  }

  // ---------- Operativo ----------
  if ((await prisma.asset.count({ where: { condominiumId: condoId } })) === 0) {
    console.log('Creando activos, proveedores y tickets…');
    // `createCondominium` ya siembra los catálogos; esta llamada cubre
    // el condominio demo creado antes de que eso existiera. Es idempotente.
    await seedCondoCatalogs(companyId, condoId);
    const categorias = await listAssetCategories(companyId, condoId);
    const categoriaId = (nombre: string) => categorias.find((c) => c.name === nombre)!.id;

    const bomba = await createAsset(companyId, { condominiumId: condoId, name: 'Bomba de agua principal', categoryId: categoriaId('Bomba'), description: 'Pedrollo 2HP, caseta norte', acquisitionValue: 850000, location: 'Caseta de máquinas', photoUrl: demoAssetPhoto });
    const porton = await createAsset(companyId, { condominiumId: condoId, name: 'Portón eléctrico acceso principal', categoryId: categoriaId('Portón'), description: 'Motor CAME BX-74, instalado 2024', acquisitionValue: 1200000 });
    await createAsset(companyId, { condominiumId: condoId, name: 'Planta eléctrica de emergencia', categoryId: categoriaId('Generador'), description: 'Generac 22kW diésel', acquisitionValue: 9500000 });
    await createAsset(companyId, { condominiumId: condoId, name: 'Sistema de piscina', categoryId: categoriaId('Piscina'), description: 'Filtro de arena + clorinador salino', acquisitionValue: 2300000 });

    const provAcuatec = await createProvider(companyId, { condominiumId: condoId, name: 'Acuatec S.A.', serviceType: 'Bombas y riego', phone: '2440-1122', email: 'servicio@acuatec.cr' });
    const provPortones = await createProvider(companyId, { condominiumId: condoId, name: 'Portones Automáticos CR', serviceType: 'Portones', phone: '2225-8844', email: 'soporte@portonescr.com' });
    await createProvider(companyId, { condominiumId: condoId, name: 'Jardines del Valle', serviceType: 'Zonas verdes', phone: '8834-5511', email: 'info@jardinesdelvalle.cr' });

    const t1 = await createTicket(companyId, actor.userId, { condominiumId: condoId, assetId: bomba.id, providerId: provAcuatec.id, ticketType: 'correctivo', title: 'Bomba pierde presión en horas pico', description: 'Revisión de impulsor y válvula check.', priority: 'alta' });
    await updateTicketStatus(companyId, t1.id, 'en_progreso');
    const t2 = await createTicket(companyId, actor.userId, { condominiumId: condoId, assetId: porton.id, providerId: provPortones.id, ticketType: 'correctivo', title: 'Portón no cierra completo', priority: 'alta' });
    await completeTicket(companyId, t2.id, actor.userId, actor.userName, 85000); // costo → asiento contable
    const t3 = await createTicket(companyId, actor.userId, { condominiumId: condoId, assetId: bomba.id, providerId: provAcuatec.id, ticketType: 'preventivo', title: 'Mantenimiento trimestral de bomba', priority: 'media' });
    await completeTicket(companyId, t3.id, actor.userId, actor.userName, 45000);
    await createTicket(companyId, actor.userId, { condominiumId: condoId, ticketType: 'preventivo', title: 'Poda general de zonas verdes', priority: 'baja' });
  }

  // ---------- Proyectos ----------
  if ((await prisma.project.count({ where: { condominiumId: condoId } })) === 0) {
    console.log('Creando proyectos…');
    await createProject(companyId, actor.userId, actor.userName, { condominiumId: condoId, name: 'Techado del área de parqueo visitantes', budget: 4800000, startDate: inDays(20) });
    const p2 = await createProject(companyId, actor.userId, actor.userName, { condominiumId: condoId, name: 'Renovación del gimnasio', description: 'Cambio de piso, espejos y 4 máquinas nuevas.', budget: 6500000, startDate: inDays(-30) });
    await setProjectStatus(companyId, p2.id, 'en_progreso');
    const m1 = await addMilestone(companyId, p2.id, 'Demolición y piso nuevo', inDays(-10));
    await toggleMilestone(companyId, m1.id, true);
    await addMilestone(companyId, p2.id, 'Instalación de espejos', inDays(7));
    await addMilestone(companyId, p2.id, 'Llegada de máquinas', inDays(21));
    await addExpense(companyId, actor.userId, actor.userName, { projectId: p2.id, condominiumId: condoId, description: 'Piso vinílico deportivo', amount: 1850000 });
    await addExpense(companyId, actor.userId, actor.userName, { projectId: p2.id, condominiumId: condoId, description: 'Mano de obra instalación', amount: 600000 });
    const p3 = await createProject(companyId, actor.userId, actor.userName, { condominiumId: condoId, name: 'Pintura de fachadas etapa 1', budget: 3200000 });
    await setProjectStatus(companyId, p3.id, 'completado');
    const p4 = await createProject(companyId, actor.userId, actor.userName, { condominiumId: condoId, name: 'Cámaras perimetrales adicionales', budget: 2100000 });
    await setProjectStatus(companyId, p4.id, 'pausado');
  }

  // ---------- Comunicados ----------
  if ((await prisma.communication.count({ where: { condominiumId: condoId } })) === 0) {
    console.log('Creando comunicados…');
    const com1 = await createCommunication(companyId, actor.userId, actor.userName, {
      condominiumId: condoId, title: 'Corte de agua programado — martes 28', category: 'aviso',
      body: 'El AyA realizará trabajos en la red principal este martes 28 de 8:00 am a 2:00 pm. Recomendamos almacenar agua con anticipación. El tanque del condominio cubrirá servicios básicos.',
      targetType: 'todos',
    });
    await publishCommunication(companyId, actor.userId, actor.userName, com1.id);
    const com2 = await createCommunication(companyId, actor.userId, actor.userName, {
      condominiumId: condoId, title: 'Nueva normativa de uso del Rancho BBQ', category: 'noticia',
      body: 'A partir de este mes, las reservas del Rancho BBQ requieren comprobante de pago adjunto y se aprueban en máximo 24 horas. La normativa completa está disponible en el módulo de Reservas.',
      targetType: 'todos',
    });
    await publishCommunication(companyId, actor.userId, actor.userName, com2.id);
    await createCommunication(companyId, actor.userId, actor.userName, {
      condominiumId: condoId, title: 'Recordatorio: cuota de julio vence el 15', category: 'recordatorio_pago',
      body: 'Recuerda que la cuota ordinaria de julio vence el 15. Puedes pagar por transferencia o SINPE Móvil indicando tu número de casa.',
      targetType: 'todos',
    });
  }

  // ---------- Contenido de Valor ----------
  if ((await prisma.contentItem.count({ where: { condominiumId: condoId } })) === 0) {
    await createContentItem(companyId, actor.userId, actor.userName, {
      condominiumId: condoId, category: 'consejo', title: 'Cómo separar residuos correctamente',
      description: 'Guía rápida de reciclaje para el centro de acopio del condominio.',
      videoUrl: 'https://www.youtube.com/watch?v=OagTXWfaXEo', publish: true,
    });
    await createContentItem(companyId, actor.userId, actor.userName, {
      condominiumId: condoId, category: 'emergencia', title: 'Qué hacer en caso de sismo',
      description: 'Protocolo de evacuación y puntos de reunión del residencial.',
      videoUrl: 'https://www.youtube.com/watch?v=BLEPakj1YTY', publish: true,
    });
  }

  // ---------- Asamblea ----------
  if ((await prisma.assembly.count({ where: { condominiumId: condoId } })) === 0) {
    console.log('Creando asamblea…');
    const assembly = await createAssembly(companyId, actor.userId, actor.userName, {
      condominiumId: condoId, type: 'ordinaria', title: 'Asamblea General Ordinaria 2026',
      eventDate: inDays(14), eventTime: '18:00', location: 'Rancho BBQ',
      convocatoriaBody: 'Se convoca a todos los propietarios a la Asamblea General Ordinaria 2026. Orden del día: informe de labores, estados financieros, presupuesto 2027 y votación del proyecto de techado de parqueos.',
      topics: ['Aprobación de estados financieros 2026', 'Presupuesto ordinario 2027', 'Proyecto: techado de parqueo de visitantes'],
    });
    const topics = await prisma.assemblyTopic.findMany({ where: { assemblyId: assembly.id }, orderBy: { sortOrder: 'asc' } });
    if (topics[0]) await openVote(companyId, topics[0].id, actor.userId, actor.userName);
  }

  // ---------- Documentos ----------
  if ((await prisma.document.count({ where: { condominiumId: condoId } })) === 0) {
    console.log('Creando documentos…');
    const doc = await createDocument(companyId, actor.userId, actor.userName, {
      condominiumId: condoId, category: 'reglamento', title: 'Reglamento interno de convivencia',
      visibility: 'residentes', fileName: 'reglamento-altamar-v1.pdf', fileUrl: demoReceipt,
    });
    await setDocumentBodyText(companyId, actor.userId, actor.userName, doc.id,
      'REGLAMENTO INTERNO DE CONVIVENCIA — RESIDENCIAL ALTAMAR\n\nArt. 1. Horario de áreas comunes: 6:00 a 22:00.\nArt. 2. El Rancho BBQ requiere reserva previa y comprobante de pago.\nArt. 3. Toda mascota debe circular con correa en áreas comunes.\nArt. 4. El volumen de música debe moderarse después de las 22:00.\nArt. 5. La cuota ordinaria vence el día 15 de cada mes; tres cuotas vencidas suspenden servicios condominales no esenciales.'
    );
  }

  // ---------- Usuarios demo para portales ----------
  if (!(await prisma.user.findFirst({ where: { companyId, email: 'laura@demo.anexypro.com' } }))) {
    console.log('Creando usuarios demo de portal…');
    const laura = await prisma.person.findFirstOrThrow({ where: { companyId, email: { equals: 'laura@demo.anexypro.com', mode: 'insensitive' } } });
    const residentUser = await prisma.user.create({
      data: { companyId, email: 'laura@demo.anexypro.com', passwordHash: await bcrypt.hash('DemoResidente2026!', 12), fullName: 'Laura Jiménez Mora', role: 'condomino' },
    });
    await prisma.person.update({ where: { id: laura.id }, data: { userId: residentUser.id } });
    await prisma.user.create({
      data: { companyId, email: 'guarda@demo.anexypro.com', passwordHash: await bcrypt.hash('DemoGuarda2026!', 12), fullName: 'Óscar Guardia Núñez', role: 'seguridad' },
    });
  }

  console.log('\n✅ Demo listo: Residencial Altamar (Demo)');
  console.log('   Residente portal:  laura@demo.anexypro.com / DemoResidente2026!');
  console.log('   Portal seguridad:  guarda@demo.anexypro.com / DemoGuarda2026!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
