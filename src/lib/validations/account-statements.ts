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

/**
 * Aplicar pago desde la línea de UN cobro puntual del histórico
 * (columna "Pago" del estado de cuenta administrativo) — a diferencia
 * de `paymentSchema` (Finanzas → Cuotas y pagos), que aplica al
 * cargo pendiente más antiguo de la filial, este siempre lleva
 * `chargeId`: el monto se asigna a esa línea, nunca a otra.
 */
export const chargePaymentSchema = z.object({
  condominiumId: z.string().uuid(),
  propertyId: z.string().uuid(),
  chargeId: z.string().uuid(),
  amount: z.coerce.number().positive('El monto debe ser mayor a cero'),
  method: z.enum(['transferencia', 'sinpe', 'efectivo', 'tarjeta', 'deposito', 'comprobante']),
  reference: z.string().max(80).optional().or(z.literal('')),
});
