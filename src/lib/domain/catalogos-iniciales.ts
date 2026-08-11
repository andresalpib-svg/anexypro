/**
 * Catálogos con los que nace un condominio.
 *
 * POR QUÉ EXISTE. Los tipos de incumplimiento y las categorías de
 * activos son datos de cliente, no constantes del código: cada
 * administración los edita a su gusto. Pero un condominio recién
 * creado con el catálogo VACÍO deja la pantalla de incumplimientos sin
 * un solo botón —"Todavía no hay tipos configurados"— y el selector de
 * categoría de un activo sin ninguna opción. Comprobado en producción:
 * los condominios nuevos quedaban así porque la siembra vivía solo en
 * los guiones `prisma/seed-*.ts`, que se corren a mano y que nadie
 * corre al dar de alta un condominio.
 *
 * Estas listas son solo el PUNTO DE PARTIDA. Se copian una vez, al
 * crear el condominio, y desde ese momento pertenecen a la
 * administración: cambiar algo aquí no toca ningún condominio que ya
 * exista.
 *
 * Los guiones de siembra importan de aquí para que no haya dos
 * versiones del mismo catálogo que se desincronicen.
 */

/** Los diez incumplimientos que la administración pidió como base. */
export const TIPOS_INCUMPLIMIENTO_INICIALES = [
  { name: 'Ruidos', description: 'Ruido que altera la tranquilidad, en especial en horario nocturno.', regulationArticle: 'Reglamento interno, capítulo de convivencia', warningsRequired: 2, daysBetween: 15, fineAmount: 25000, immediateFine: false, sortOrder: 1 },
  { name: 'Perro Suelto', description: 'Mascotas sueltas, sin correa o cuyos desechos no se recogen.', regulationArticle: 'Reglamento interno, capítulo de mascotas', warningsRequired: 2, daysBetween: 15, fineAmount: 20000, immediateFine: false, sortOrder: 2 },
  { name: 'Vehículo mal estacionado', description: 'Vehículo en espacio ajeno, en zona de circulación o en área común.', regulationArticle: 'Reglamento interno, capítulo de parqueos', warningsRequired: 1, daysBetween: 10, fineAmount: 15000, immediateFine: false, sortOrder: 3 },
  { name: 'Objetos en cochera', description: 'Objetos almacenados en la cochera que no corresponden o que obstruyen la circulación.', regulationArticle: 'Reglamento interno, capítulo de parqueos', warningsRequired: 2, daysBetween: 15, fineAmount: 15000, immediateFine: false, sortOrder: 4 },
  { name: 'Uso indebido del parqueo de visitas', description: 'Parqueo de visitas ocupado por un residente o por más tiempo del permitido.', regulationArticle: 'Reglamento interno, capítulo de parqueos', warningsRequired: 1, daysBetween: 10, fineAmount: 15000, immediateFine: false, sortOrder: 5 },
  { name: 'Mal uso de Casa Club', description: 'Incumplimiento de la normativa de reserva, horario o aforo de la Casa Club.', regulationArticle: 'Reglamento interno, capítulo de áreas comunes', warningsRequired: 2, daysBetween: 15, fineAmount: 20000, immediateFine: false, sortOrder: 6 },
  { name: 'Mal uso de Gym', description: 'Incumplimiento de la normativa de horario, aforo o equipo del gimnasio.', regulationArticle: 'Reglamento interno, capítulo de áreas comunes', warningsRequired: 2, daysBetween: 15, fineAmount: 20000, immediateFine: false, sortOrder: 7 },
  { name: 'Mal uso de piscina', description: 'Incumplimiento de la normativa de horario, aforo o normas de seguridad de la piscina.', regulationArticle: 'Reglamento interno, capítulo de áreas comunes', warningsRequired: 1, daysBetween: 10, fineAmount: 25000, immediateFine: false, sortOrder: 8 },
  { name: 'Mal uso de la cancha', description: 'Incumplimiento de la normativa de reserva, horario o aforo de la cancha.', regulationArticle: 'Reglamento interno, capítulo de áreas comunes', warningsRequired: 2, daysBetween: 15, fineAmount: 20000, immediateFine: false, sortOrder: 9 },
  { name: 'Basura visible', description: 'Residuos fuera del horario o del sitio dispuesto para su recolección.', regulationArticle: 'Reglamento interno, capítulo de aseo', warningsRequired: 2, daysBetween: 10, fineAmount: 15000, immediateFine: false, sortOrder: 10 },
];

/** Las siete categorías de activos de partida. */
export const CATEGORIAS_ACTIVO_INICIALES = [
  { name: 'Elevador', sortOrder: 1 },
  { name: 'Bomba', sortOrder: 2 },
  { name: 'Generador', sortOrder: 3 },
  { name: 'Piscina', sortOrder: 4 },
  { name: 'Portón', sortOrder: 5 },
  { name: 'Techo', sortOrder: 6 },
  { name: 'Otro', sortOrder: 7 },
];

/** Ajustes de partida del documento de notificación de incumplimientos. */
export const AJUSTES_INCUMPLIMIENTO_INICIALES = {
  headerText: 'Administración del condominio',
  footerText: 'Documento emitido electrónicamente por ANEXYpro.',
  signerTitle: 'Administración',
  responseDays: 8,
};
