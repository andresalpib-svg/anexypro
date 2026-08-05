import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `Eres un analista que explica reportes de administración de condominios. Recibes datos YA CALCULADOS (nunca los inventes, cambies ni redondees distinto a como vienen) en formato de texto, y los explicas en 2-4 oraciones en español, destacando lo más relevante para un administrador (por ejemplo, el condominio con peor recaudo, o si hay proyectos sobre presupuesto). Tono directo, profesional, sin relleno.`;

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export async function explainReportData(dataText: string): Promise<string> {
  const anthropic = getClient();
  if (!anthropic) return 'El Generador de Reportes todavía no está conectado en este entorno (falta ANTHROPIC_API_KEY).';

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: dataText }],
  });
  return message.content.find((b) => b.type === 'text')?.text ?? 'No se pudo generar una explicación.';
}
