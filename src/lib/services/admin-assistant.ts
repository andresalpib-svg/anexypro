import Anthropic from '@anthropic-ai/sdk';
import { withTenantContext } from '@/lib/db';
import { fechaSolo } from '@/lib/fecha-local';

const SYSTEM_PROMPT = `Eres el Asistente Administrativo de ANEXYpro. Recibes un resumen de datos REALES del sistema (ya calculados, no los inventes ni los cambies) y una pregunta del administrador. Responde SOLO con base en esos datos, en 1-3 oraciones, en español, tono profesional y directo. Si la pregunta no se puede responder con los datos entregados, dilo explícitamente en vez de adivinar.`;

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

async function getSystemSnapshot(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, async (tx) => {
    const [unitsTotal, unitsDelinquent, openIncidents, pendingTickets, upcomingAssembly, pendingReservations] = await Promise.all([
      tx.property.count({ where: { condominiumId, status: 'activa' } }),
      tx.charge.groupBy({ by: ['propertyId'], where: { condominiumId, status: { in: ['pendiente', 'parcial'] }, dueDate: { lt: new Date() } } }),
      tx.incident.count({ where: { condominiumId, status: { not: 'cerrado' } } }),
      tx.maintenanceTicket.count({ where: { condominiumId, status: { in: ['reportado', 'programado', 'en_progreso'] } } }),
      tx.assembly.findFirst({ where: { condominiumId, status: 'convocada' }, orderBy: { eventDate: 'asc' } }),
      tx.reservation.count({ where: { condominiumId, status: 'pendiente_aprobacion' } }),
    ]);
    return {
      unitsTotal,
      unitsDelinquent: unitsDelinquent.length,
      openIncidents,
      pendingTickets,
      nextAssembly: upcomingAssembly ? `${upcomingAssembly.title} el ${fechaSolo(upcomingAssembly.eventDate)}` : 'ninguna programada',
      pendingReservations,
    };
  });
}

export async function askAdministrativeAssistant(companyId: string, condominiumId: string, question: string): Promise<string> {
  const snapshot = await getSystemSnapshot(companyId, condominiumId);
  const dataText = `Unidades activas: ${snapshot.unitsTotal}
Unidades en morosidad: ${snapshot.unitsDelinquent}
Incidentes abiertos: ${snapshot.openIncidents}
Tickets de mantenimiento pendientes: ${snapshot.pendingTickets}
Próxima asamblea: ${snapshot.nextAssembly}
Reservas pendientes de aprobación: ${snapshot.pendingReservations}`;

  const anthropic = getClient();
  if (!anthropic) {
    return `El asistente de IA todavía no está conectado (falta ANTHROPIC_API_KEY). Datos actuales:\n${dataText}`;
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Datos del sistema:\n${dataText}\n\nPregunta: ${question}` }],
  });

  return message.content.find((b) => b.type === 'text')?.text ?? 'No se pudo generar una respuesta.';
}
