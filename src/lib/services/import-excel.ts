import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { withTenantContext } from '@/lib/db';
import { buscarPersonaExistente, camposQueFaltan } from '@/lib/services/person-identity';

export type ImportResult = {
  unitsCreated: number;
  unitsExisting: number;
  residentsCreated: number;
  residentsLinked: number;
  vehiclesCreated: number;
  cohabitantsCreated: number;
  visitsCreated: number;
  rowsSkipped: { row: number; reason: string }[];
};

const VALID_ROLES = new Set(['propietario', 'residente', 'inquilino', 'familiar', 'empleado']);
const VALID_TYPES = new Set(['casa', 'apartamento', 'local', 'lote', 'parqueo', 'bodega']);

/** "Correo Electrónico " → "correo electronico" */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function headerKey(header: string): string | null {
  const h = normalize(header);
  // El orden importa: las frases largas primero para que "nombre de
  // quienes habitan…" o "…visitas recurrentes" no caigan en "nombre".
  if (h.includes('visita') || h.includes('recurrente')) return 'recurrentVisits';
  if (h.includes('habitan') || h.includes('habitante') || h.includes('conviv')) return 'cohabitants';
  if (h.includes('primer apellido') || h === 'apellido 1' || h === 'apellido1') return 'lastName1';
  if (h.includes('segundo apellido') || h === 'apellido 2' || h === 'apellido2') return 'lastName2';
  if (h.includes('placa')) return 'vehiclePlate';
  if (h.includes('marca')) return 'vehicleBrand';
  if (['nombre', 'residente', 'propietario'].some((k) => h === k || h.startsWith(k))) return 'name';
  if (['telefono', 'celular', 'movil', 'phone'].some((k) => h.includes(k)) || h.includes('telefonico')) return 'phone';
  if (['correo', 'email', 'mail'].some((k) => h.includes(k))) return 'email';
  if (['cedula', 'identificacion'].some((k) => h.startsWith(k)) || h === 'id') return 'idNumber';
  if (h.includes('rol')) return 'role';
  if (h.includes('tipo')) return 'type';
  if (
    ['filial', 'unidad', 'codigo', 'casa', 'propiedad', 'numero'].some((k) => h.includes(k)) ||
    ['no', 'nº', 'n°', '#'].includes(h)
  )
    return 'code';
  return null;
}

/** "Ana Mora - 1-2345-6789" → { name: 'Ana Mora', idNumber: '1-2345-6789' } */
function parseNameWithId(entry: string): { name: string; idNumber: string | null } {
  const idMatch = entry.match(/\d[\d-]{4,}/);
  const idNumber = idMatch ? idMatch[0] : null;
  const name = entry
    .replace(idMatch?.[0] ?? '', '')
    .replace(/[·|,;:—-]+\s*$/g, '')
    .replace(/^\s*[·|,;:—-]+/g, '')
    .trim();
  return { name, idNumber };
}

function splitList(cell: string): string[] {
  return cell
    .split(/[;,\n/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function genVisitCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
}

/**
 * Importa la base del condominio desde Excel. Formato oficial (el
 * orden de columnas no importa, los acentos tampoco):
 *
 *   Número de filial · Nombre · Primer apellido · Segundo apellido ·
 *   Cédula · Correo electrónico · Número telefónico · Placa de
 *   vehículo · Marca de vehículo · Nombre de quienes habitan con
 *   usted en la propiedad · Nombre completo y número de cédula de
 *   visitas recurrentes
 *
 * - La filial (unidad) se crea si no existe.
 * - El titular se registra como propietario (o el Rol si la columna
 *   existe) y se reutiliza si su correo ya está en la empresa.
 * - "Quienes habitan" crea a cada persona como residente de la filial.
 * - Las visitas recurrentes generan su autorización vigente con
 *   nombre y cédula.
 * - Las filas con error no detienen la importación: se reportan.
 */
export async function importResidentsExcel(
  companyId: string,
  condominiumId: string,
  fileBuffer: Buffer
): Promise<ImportResult> {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('El archivo de Excel no tiene hojas.');
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]!, { defval: '' });
  if (rows.length === 0) throw new Error('La hoja de Excel está vacía.');

  const firstRow = rows[0]!;
  const columnMap: Record<string, string> = {};
  for (const header of Object.keys(firstRow)) {
    const key = headerKey(header);
    if (key && !(key in columnMap)) columnMap[key] = header;
  }
  if (!columnMap.code) {
    throw new Error(
      `No se encontró la columna de filial. Encabezados leídos: ${Object.keys(firstRow).join(', ')}. Se espera "Número de filial" (o "Unidad").`
    );
  }

  const result: ImportResult = {
    unitsCreated: 0,
    unitsExisting: 0,
    residentsCreated: 0,
    residentsLinked: 0,
    vehiclesCreated: 0,
    cohabitantsCreated: 0,
    visitsCreated: 0,
    rowsSkipped: [],
  };

  return withTenantContext(companyId, async (tx) => {
    const propertyIdByCode = new Map<string, string>();
    const existing = await tx.property.findMany({ where: { condominiumId }, select: { id: true, code: true } });
    for (const p of existing) propertyIdByCode.set(p.code.toUpperCase(), p.id);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowNum = i + 2; // 1-indexado + encabezado
      const get = (key: string) => String(row[columnMap[key] ?? ''] ?? '').trim();

      const code = get('code').toUpperCase();
      if (!code) {
        result.rowsSkipped.push({ row: rowNum, reason: 'Sin número de filial.' });
        continue;
      }

      // ---- Filial ----
      let propertyId = propertyIdByCode.get(code);
      if (!propertyId) {
        const rawType = normalize(get('type'));
        const propertyType = VALID_TYPES.has(rawType) ? rawType : 'casa';
        const property = await tx.property.create({ data: { condominiumId, code, propertyType: propertyType as any } });
        propertyId = property.id;
        propertyIdByCode.set(code, propertyId);
        result.unitsCreated++;
      } else {
        result.unitsExisting++;
      }

      // ---- Titular ----
      const fullName = [get('name'), get('lastName1'), get('lastName2')].filter(Boolean).join(' ').trim();
      if (fullName) {
        const email = get('email') || null;
        const rawRole = normalize(get('role'));
        const role = VALID_ROLES.has(rawRole) ? rawRole : 'propietario';

        // Reconoce a quien ya está registrado —por cédula o por
        // correo— en vez de crear una ficha por condominio. Es lo que
        // permite importar el padrón de un segundo condominio sin
        // duplicar a quien tiene propiedad en los dos.
        let person = await buscarPersonaExistente(tx, companyId, { idNumber: get('idNumber'), email });
        if (person) {
          const faltantes = camposQueFaltan(person, {
            idNumber: get('idNumber') || null,
            email,
            phone: get('phone') || null,
          });
          if (Object.keys(faltantes).length > 0) {
            person = await tx.person.update({ where: { id: person.id }, data: faltantes });
          }
        }
        if (!person) {
          try {
            person = await tx.person.create({
              data: { companyId, fullName, idNumber: get('idNumber') || null, email, phone: get('phone') || null },
            });
            result.residentsCreated++;
          } catch (e: any) {
            result.rowsSkipped.push({ row: rowNum, reason: `No se pudo crear a "${fullName}": ${e?.message ?? 'error'}` });
            continue;
          }
        }

        const alreadyLinked = await tx.propertyMember.findFirst({ where: { propertyId, personId: person.id, endDate: null } });
        if (!alreadyLinked) {
          await tx.propertyMember.create({
            data: { propertyId, personId: person.id, role: role as any, isPrimary: role === 'propietario' },
          });
          await tx.propertyEvent.create({
            data: { propertyId, eventType: 'nuevo_miembro', description: `${fullName} se registró como ${role} (importación Excel).` },
          });
          result.residentsLinked++;
        }

        // ---- Vehículo ----
        const plate = get('vehiclePlate').toUpperCase();
        if (plate) {
          const plateExists = await tx.vehicle.findFirst({ where: { propertyId, plate } });
          if (!plateExists) {
            try {
              await tx.vehicle.create({
                data: { propertyId, plate, brand: get('vehicleBrand') || null, vehicleType: 'automovil' },
              });
              result.vehiclesCreated++;
            } catch (e: any) {
              result.rowsSkipped.push({ row: rowNum, reason: `Placa ${plate}: ${e?.message?.split('\n')[0] ?? 'error'}` });
            }
          }
        }

        // ---- Quienes habitan la propiedad ----
        for (const cohabitant of splitList(get('cohabitants'))) {
          if (normalize(cohabitant) === normalize(fullName)) continue;
          const dup = await tx.propertyMember.findFirst({
            where: { propertyId, endDate: null, person: { fullName: { equals: cohabitant, mode: 'insensitive' } } },
          });
          if (dup) continue;
          const cohabitantPerson = await tx.person.create({ data: { companyId, fullName: cohabitant } });
          await tx.propertyMember.create({
            data: { propertyId, personId: cohabitantPerson.id, role: 'residente' },
          });
          result.cohabitantsCreated++;
        }

        // ---- Visitas recurrentes ----
        for (const entry of splitList(get('recurrentVisits'))) {
          const { name, idNumber } = parseNameWithId(entry);
          if (!name) continue;
          const dup = await tx.visitAuthorization.findFirst({
            where: { propertyId, visitType: 'recurrente', status: 'vigente', visitorName: { equals: name, mode: 'insensitive' } },
          });
          if (dup) continue;
          await tx.visitAuthorization.create({
            data: {
              condominiumId,
              propertyId,
              visitType: 'recurrente',
              visitorName: name,
              visitorIdNumber: idNumber,
              code: genVisitCode(),
            },
          });
          result.visitsCreated++;
        }
      }
    }

    return result;
  },
  // Una carga de 95 filiales son cientos de consultas: con el plazo de
  // 5 s de Prisma, contra una base remota la transacción se cortaba a
  // mitad y se revertía el archivo entero. Ver `withTenantContext`.
  { timeout: 180_000, maxWait: 20_000 });
}

/** Genera la plantilla de importación con filas de ejemplo. */
export function buildImportTemplate(): Uint8Array {
  const rows = [
    {
      'Número de filial': 'CASA-01',
      Nombre: 'María',
      'Primer apellido': 'Pérez',
      'Segundo apellido': 'Rojas',
      Cédula: '1-1111-1111',
      'Correo electrónico': 'maria@example.com',
      'Número telefónico': '8888-8888',
      'Placa de vehículo': 'ABC-123',
      'Marca de vehículo': 'Toyota',
      'Nombre de quienes habitan con usted en la propiedad': 'José Pérez Rojas; Lucía Pérez Mora',
      'Nombre completo y número de cédula de visitas recurrentes': 'Carlos Solano Vega - 1-2222-2222; Rosa Ulate Mora - 1-3333-3333',
    },
    {
      'Número de filial': 'CASA-02',
      Nombre: 'Luis',
      'Primer apellido': 'Araya',
      'Segundo apellido': 'Castro',
      Cédula: '2-4444-4444',
      'Correo electrónico': 'luis@example.com',
      'Número telefónico': '8999-9999',
      'Placa de vehículo': '',
      'Marca de vehículo': '',
      'Nombre de quienes habitan con usted en la propiedad': '',
      'Nombre completo y número de cédula de visitas recurrentes': '',
    },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0]!).map((k) => ({ wch: Math.max(k.length, 22) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Residentes');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
}
