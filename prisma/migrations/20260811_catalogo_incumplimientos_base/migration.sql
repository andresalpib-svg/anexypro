-- Catálogo base de incumplimientos para los condominios que quedaron sin ninguno.
--
-- POR QUÉ. Hasta ahora `createCondominium` no sembraba ningún catálogo:
-- la siembra vivía solo en `prisma/seed-violations.ts`, un guion que se
-- corre a mano. Resultado comprobado en producción: todo condominio
-- creado desde la aplicación abría Gestión de Incumplimientos con
-- "Todavía no hay tipos de incumplimiento configurados" y sin un solo
-- botón que tocar. El código ya no deja que eso vuelva a pasar
-- (`seedCondoCatalogs`), pero los condominios que YA existen siguen
-- vacíos — esta migración los pone al día.
--
-- Solo toca los condominios con CERO tipos. Uno que ya tenga catálogo
-- —aunque sea el viejo, o uno que la administración personalizó— no se
-- toca: renombrar o completar ese caso es trabajo de
-- `prisma/sync-violations-catalog.ts`, que se corre a conciencia y sabe
-- preservar el historial de expedientes.

INSERT INTO "violation_types" (
  id, condominium_id, name, description, regulation_article,
  warnings_required, days_between, fine_amount, immediate_fine,
  sort_order, is_active, created_at, updated_at
)
SELECT
  gen_random_uuid()::text, c.id, v.name, v.description, v.regulation_article,
  v.warnings_required, v.days_between, v.fine_amount, false,
  v.sort_order, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM condominiums c
CROSS JOIN (VALUES
  ('Ruidos', 'Ruido que altera la tranquilidad, en especial en horario nocturno.', 'Reglamento interno, capítulo de convivencia', 2, 15, 25000, 1),
  ('Perro Suelto', 'Mascotas sueltas, sin correa o cuyos desechos no se recogen.', 'Reglamento interno, capítulo de mascotas', 2, 15, 20000, 2),
  ('Vehículo mal estacionado', 'Vehículo en espacio ajeno, en zona de circulación o en área común.', 'Reglamento interno, capítulo de parqueos', 1, 10, 15000, 3),
  ('Objetos en cochera', 'Objetos almacenados en la cochera que no corresponden o que obstruyen la circulación.', 'Reglamento interno, capítulo de parqueos', 2, 15, 15000, 4),
  ('Uso indebido del parqueo de visitas', 'Parqueo de visitas ocupado por un residente o por más tiempo del permitido.', 'Reglamento interno, capítulo de parqueos', 1, 10, 15000, 5),
  ('Mal uso de Casa Club', 'Incumplimiento de la normativa de reserva, horario o aforo de la Casa Club.', 'Reglamento interno, capítulo de áreas comunes', 2, 15, 20000, 6),
  ('Mal uso de Gym', 'Incumplimiento de la normativa de horario, aforo o equipo del gimnasio.', 'Reglamento interno, capítulo de áreas comunes', 2, 15, 20000, 7),
  ('Mal uso de piscina', 'Incumplimiento de la normativa de horario, aforo o normas de seguridad de la piscina.', 'Reglamento interno, capítulo de áreas comunes', 1, 10, 25000, 8),
  ('Mal uso de la cancha', 'Incumplimiento de la normativa de reserva, horario o aforo de la cancha.', 'Reglamento interno, capítulo de áreas comunes', 2, 15, 20000, 9),
  ('Basura visible', 'Residuos fuera del horario o del sitio dispuesto para su recolección.', 'Reglamento interno, capítulo de aseo', 2, 10, 15000, 10)
) AS v(name, description, regulation_article, warnings_required, days_between, fine_amount, sort_order)
WHERE c.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM violation_types t WHERE t.condominium_id = c.id);

-- Ajustes del documento de notificación, para el condominio que no los
-- tenga. Sin esta fila el PDF sale sin membrete ni firma.
INSERT INTO "violation_settings" (id, condominium_id, header_text, footer_text, signer_title, response_days)
SELECT
  gen_random_uuid()::text, c.id,
  'Administración del condominio',
  'Documento emitido electrónicamente por ANEXYpro.',
  'Administración',
  8
FROM condominiums c
WHERE c.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM violation_settings s WHERE s.condominium_id = c.id);
