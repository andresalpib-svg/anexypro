import { z } from 'zod';

/**
 * Envío del estado de cuenta de UNA filial por correo.
 *
 * `condominiumId` y `propertyId` viajan en el formulario, pero nunca
 * se confían tal cual: la acción vuelve a resolver el condominio real
 * de la filial contra la base (`condoOfProperty`) y lo compara con
 * este valor antes de hacer nada — mismo patrón que `paymentSchema`
 * en `finance.ts`, para que dos condominios (o dos filiales del
 * mismo condominio) nunca puedan mezclarse en un envío.
 */
export const sendStatementSchema = z.object({
  condominiumId: z.string().uuid(),
  propertyId: z.string().uuid(),
  to: z.string().trim().email('Ingresa un correo válido'),
});
