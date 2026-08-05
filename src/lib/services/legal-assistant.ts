import Anthropic from '@anthropic-ai/sdk';
import { withTenantContext } from '@/lib/db';

const SYSTEM_PROMPT = `Eres el Árbitro Legal de ANEXYpro, un asistente para residentes de un condominio en Costa Rica.

REGLAS ABSOLUTAS, sin excepción:
1. SOLO puedes responder con base en el texto del reglamento que se te entrega a continuación. Nunca inventes artículos, cláusulas o normas que no estén literalmente en ese texto.
2. Si la pregunta no está cubierta por el texto entregado, dilo explícitamente: "El reglamento de tu condominio no cubre este tema específicamente" — y sugiere consultar con la administración. Nunca improvises una respuesta "razonable" que no esté fundamentada en el texto.
3. Cuando cites el reglamento, sé preciso — usa las palabras del texto, no una paráfrasis que cambie el sentido.
4. No des consejos legales generales de Costa Rica que no estén en el reglamento del condominio (por ejemplo, no cites la Ley de Propiedad en Condominio a menos que esté literalmente en el texto entregado).
5. Sé breve y directo — 2 a 4 oraciones normalmente.`;

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export type LegalAnswer = { answer: string; grounded: boolean };

/**
 * Pregunta al Árbitro Legal. SIEMPRE fundamentado en documents.bodyText
 * real del condominio (categoría 'reglamento', visibles a residentes) —
 * si no hay ningún reglamento con contenido de texto cargado, o si no
 * hay ANTHROPIC_API_KEY configurada, responde con honestidad en vez de
 * fabricar una respuesta. Ver el comentario de bodyText en schema.prisma.
 */
export async function askLegalArbiter(companyId: string, condominiumId: string, question: string): Promise<LegalAnswer> {
  const regulations = await withTenantContext(companyId, (tx) =>
    tx.document.findMany({
      where: { condominiumId, category: 'reglamento', visibility: 'residentes', status: 'vigente', bodyText: { not: null } },
      select: { title: true, bodyText: true },
    })
  );

  if (regulations.length === 0) {
    return {
      grounded: false,
      answer:
        'Tu administración todavía no ha cargado el contenido de texto del reglamento — sin eso, no puedo responder con fundamento real y prefiero no inventar una respuesta. Pídele a la administración que complete el reglamento en Gestión Documental.',
    };
  }

  const anthropic = getClient();
  if (!anthropic) {
    return {
      grounded: false,
      answer:
        'El asistente de IA todavía no está conectado en este entorno (falta la variable ANTHROPIC_API_KEY). Mientras tanto, puedes consultar el reglamento completo en la sección de abajo.',
    };
  }

  const context = regulations.map((r) => `--- ${r.title} ---\n${r.bodyText}`).join('\n\n');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Texto del reglamento de mi condominio:\n\n${context}\n\nMi pregunta: ${question}`,
      },
    ],
  });

  const answer = message.content.find((b) => b.type === 'text')?.text ?? 'No se pudo generar una respuesta.';
  return { grounded: true, answer };
}
