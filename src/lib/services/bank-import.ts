import * as XLSX from 'xlsx';
import type { ParsedRow } from '@/lib/services/bank-reconciliation';

/**
 * Lectura del estado de cuenta bancario.
 *
 * Cada banco costarricense exporta con su propio formato y sus propios
 * encabezados, así que en lugar de exigir una plantilla se DETECTAN las
 * columnas por su nombre. El administrador sube el archivo tal como se
 * lo dio el banco.
 *
 * Soporta débito/crédito en columnas separadas (BAC, BN) y monto único
 * con signo (BCR, Davivienda).
 */

const HEADER_ALIASES = {
  date: ['fecha', 'fecha movimiento', 'fecha transaccion', 'fecha de transaccion', 'date', 'fec'],
  description: ['descripcion', 'detalle', 'concepto', 'referencia descripcion', 'description', 'transaccion'],
  reference: ['referencia', 'documento', 'num documento', 'numero documento', 'comprobante', 'reference'],
  amount: ['monto', 'importe', 'amount', 'valor'],
  credit: ['credito', 'creditos', 'deposito', 'depositos', 'abono', 'abonos', 'ingreso'],
  debit: ['debito', 'debitos', 'retiro', 'retiros', 'cargo', 'cargos', 'egreso'],
  balance: ['saldo', 'balance', 'saldo disponible'],
} as const;

function normalizeHeader(h: string): string {
  return String(h)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findColumn(headers: string[], aliases: readonly string[]): number {
  const norm = headers.map(normalizeHeader);
  // Primero coincidencia exacta, luego parcial: evita que "fecha
  // valor" gane sobre "fecha" cuando existen ambas.
  for (const alias of aliases) {
    const i = norm.indexOf(alias);
    if (i >= 0) return i;
  }
  for (const alias of aliases) {
    const i = norm.findIndex((h) => h.includes(alias));
    if (i >= 0) return i;
  }
  return -1;
}

/** Acepta 15/07/2026, 2026-07-15 y el número de serie de Excel. */
function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }
  const s = String(value ?? '').trim();
  if (!s) return null;

  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y!.length === 2 ? 2000 + Number(y) : Number(y);
    return new Date(Date.UTC(year, Number(m) - 1, Number(d)));
  }
  const ymd = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }
  return null;
}

/** Acepta "1.234,56", "1,234.56", "(500)" y "₡ 75 000". */
function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;

  let s = String(value).trim();
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()₡$\s]/g, '').replace(/^-/, '');
  if (!s) return null;

  // Si tiene coma y punto, el ÚLTIMO separador es el decimal.
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // Coma sola: decimal si deja 1 o 2 dígitos a la derecha.
    const decimals = s.length - lastComma - 1;
    s = decimals <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  }

  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return negative ? -Math.abs(n) : n;
}

export type ParseReport = {
  rows: ParsedRow[];
  skipped: number;
  columns: Record<string, string | null>;
  error?: string;
};

export function parseBankStatement(buffer: Buffer): ParseReport {
  const book = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = book.SheetNames[0];
  if (!sheetName) return { rows: [], skipped: 0, columns: {}, error: 'El archivo no tiene ninguna hoja.' };

  const sheet = book.Sheets[sheetName]!;
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false });
  if (matrix.length === 0) return { rows: [], skipped: 0, columns: {}, error: 'El archivo está vacío.' };

  // La fila de encabezados no siempre es la primera: los bancos ponen
  // arriba el nombre del cliente, el período y el número de cuenta.
  let headerIndex = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(matrix.length, 25); i += 1) {
    const candidate = (matrix[i] ?? []).map((c) => String(c ?? ''));
    const hasDate = findColumn(candidate, HEADER_ALIASES.date) >= 0;
    const hasMoney =
      findColumn(candidate, HEADER_ALIASES.amount) >= 0 ||
      findColumn(candidate, HEADER_ALIASES.credit) >= 0 ||
      findColumn(candidate, HEADER_ALIASES.debit) >= 0;
    if (hasDate && hasMoney) {
      headerIndex = i;
      headers = candidate;
      break;
    }
  }

  if (headerIndex < 0) {
    return {
      rows: [],
      skipped: 0,
      columns: {},
      error:
        'No se encontraron las columnas de fecha y monto. Revisá que el archivo sea el estado de cuenta tal como lo exporta el banco.',
    };
  }

  const col = {
    date: findColumn(headers, HEADER_ALIASES.date),
    description: findColumn(headers, HEADER_ALIASES.description),
    reference: findColumn(headers, HEADER_ALIASES.reference),
    amount: findColumn(headers, HEADER_ALIASES.amount),
    credit: findColumn(headers, HEADER_ALIASES.credit),
    debit: findColumn(headers, HEADER_ALIASES.debit),
    balance: findColumn(headers, HEADER_ALIASES.balance),
  };

  const rows: ParsedRow[] = [];
  let skipped = 0;

  for (let i = headerIndex + 1; i < matrix.length; i += 1) {
    const raw = matrix[i] ?? [];
    const date = parseDate(raw[col.date]);
    if (!date) {
      skipped += 1;
      continue;
    }

    let amount: number | null = null;
    if (col.credit >= 0 || col.debit >= 0) {
      const credit = col.credit >= 0 ? parseAmount(raw[col.credit]) ?? 0 : 0;
      const debit = col.debit >= 0 ? parseAmount(raw[col.debit]) ?? 0 : 0;
      amount = Math.abs(credit) - Math.abs(debit);
    } else if (col.amount >= 0) {
      amount = parseAmount(raw[col.amount]);
    }

    if (amount === null || amount === 0) {
      skipped += 1;
      continue;
    }

    const description = col.description >= 0 ? String(raw[col.description] ?? '').trim() : '';
    rows.push({
      date,
      description: description || 'Movimiento sin detalle',
      reference: col.reference >= 0 ? String(raw[col.reference] ?? '').trim() || null : null,
      amount,
      balanceAfter: col.balance >= 0 ? parseAmount(raw[col.balance]) : null,
    });
  }

  return {
    rows,
    skipped,
    columns: {
      fecha: col.date >= 0 ? headers[col.date]! : null,
      descripcion: col.description >= 0 ? headers[col.description]! : null,
      referencia: col.reference >= 0 ? headers[col.reference]! : null,
      monto:
        col.amount >= 0
          ? headers[col.amount]!
          : [col.credit >= 0 ? headers[col.credit] : null, col.debit >= 0 ? headers[col.debit] : null]
              .filter(Boolean)
              .join(' / ') || null,
    },
  };
}
