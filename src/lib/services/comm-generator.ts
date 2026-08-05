import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `Eres un redactor de comunicados para administradoras de condominios en Costa Rica.

Recibes una instrucción breve del administrador (p. ej. "avisar corte de agua mañana de 8am a 2pm") y generas un comunicado breve, claro y profesional en español.

Responde ÚNICAMENTE con un objeto JSON, sin texto adicional, sin backticks de markdown, con este formato exacto:
{"title": "...", "body": "...", "category": "aviso|noticia|urgente|mantenimiento|asamblea|recordatorio_pago|suspension"}

El título debe ser corto (máximo 80 caracteres). El cuerpo debe ser 2-4 oraciones, tono cordial pero directo, sin inventar fechas ni datos que el administrador no haya dado — si falta un dato importante (por ejemplo la hora exacta), dilo de forma genérica en vez de inventarlo.`;

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export type CommDraft = { title: string; body: string; category: string };

export async function generateCommunicationDraft(instruction: string): Promise<CommDraft | { error: string }> {
  const anthropic = getClient();
  if (!anthropic) return { error: 'El Generador de Comunicados todavía no está conectado en este entorno (falta ANTHROPIC_API_KEY).' };

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: instruction }],
  });

  const text = message.content.find((b) => b.type === 'text')?.text ?? '';
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (!parsed.title || !parsed.body) throw new Error('faltan campos');
    return { title: parsed.title, body: parsed.body, category: parsed.category ?? 'aviso' };
  } catch {
    return { error: 'No se pudo interpretar la respuesta generada. Intenta reformular la instrucción.' };
  }
}
