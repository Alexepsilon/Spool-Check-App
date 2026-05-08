// File importers: xlsx, csv, photo (lazy-loaded Tesseract).
//
// Strategy mirrors the Flutter ExcelParser:
//   1. Walk every sheet looking for a header row that contains both a
//      drawing-style column and a spool column.
//   2. Read data rows from there until two consecutive blanks.
//   3. If no recognisable header is found, fall back to "any
//      code-shaped string" loose extraction.

import * as XLSX from 'xlsx';
import { DEFAULT_CODE_PATTERN, DRAWING_HEADERS, SPOOL_HEADERS } from './constants';

export interface ImportedItem {
  drawing: string;
  spool: string;
  isoNumber?: string;
  project?: string;
  diameter?: string;
  paintSpec?: string;
  ral?: string;
  chClean?: string;
  remark?: string;
}

export interface ImportResult {
  items: ImportedItem[];
  /** Header row contents found during structured parsing — useful for
   *  surfacing column-mapping UI. */
  detectedHeader?: string[];
  /** Index map: standard field -> column index. -1 when absent. */
  columnMap?: Record<keyof ImportedItem, number>;
}

// Bilingual aliases for secondary fields. Headers are matched case-insensitively
// with substring matching, so a Dutch sheet uses the same code path as English.
const standardFieldHeaders: Record<keyof ImportedItem, string[]> = {
  drawing: DRAWING_HEADERS,
  spool: SPOOL_HEADERS,
  isoNumber: ['iso number', 'iso no', 'iso nummer', 'iso nr'],
  project: ['project', 'area', 'gebied', 'job', 'project nr'],
  diameter: ['diameter', 'dia', 'size', 'maat', 'dn'],
  paintSpec: [
    'paint spec',
    'paint spec.',
    'paint specification',
    'paint',
    'verfsysteem', // Dutch
    'verfspec',
    'verfspecificatie',
  ],
  ral: ['ral', 'ral colour', 'ral color', 'kleur'],
  chClean: ['ch.clean.', 'ch clean', 'cleanliness', 'reiniging', 'schoonheid'],
  remark: ['remark', 'note', 'remarks', 'opmerking', 'opmerkingen', 'notities'],
};

function normaliseHeader(s: string): string {
  return s
    .toString()
    .toLowerCase()
    .replace(/[\.\s_]+/g, '');
}

function matchHeader(value: string, candidates: string[]): boolean {
  const v = normaliseHeader(value);
  return candidates.some((c) => {
    const cn = normaliseHeader(c);
    return v === cn || v.includes(cn) || cn.includes(v);
  });
}

function looksLikeCode(s: string): boolean {
  const t = s.trim();
  if (t.length < 3 || t.length > 64) return false;
  if (/\s/.test(t)) return false;
  if (!t.includes('-')) return false;
  return /\d/.test(t) && /[A-Za-z]/.test(t);
}

/** Read an .xlsx ArrayBuffer; returns parsed items. */
export async function parseXlsx(buffer: ArrayBuffer): Promise<ImportResult> {
  const wb = XLSX.read(buffer, { type: 'array' });

  // Try structured parse on each sheet; use the first one that yields rows.
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: true,
    });
    const structured = parseStructured(rows);
    if (structured.items.length > 0) return structured;
  }

  // Fallback: loose code-string extraction across the first sheet.
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = sheet
    ? XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
        raw: true,
      })
    : [];
  const seen = new Set<string>();
  const items: ImportedItem[] = [];
  for (const row of rows) {
    for (const cell of row) {
      const s = cell == null ? '' : String(cell).trim();
      if (!looksLikeCode(s)) continue;
      if (!new RegExp(DEFAULT_CODE_PATTERN.source).test(s)) continue;
      if (!seen.has(s)) {
        seen.add(s);
        items.push({ drawing: s, spool: '' });
      }
    }
  }
  return { items };
}

function parseStructured(rows: unknown[][]): ImportResult {
  const headerInfo = findHeader(rows);
  if (!headerInfo) return { items: [] };
  const { rowIdx, columnMap, header } = headerInfo;

  const drawingCol = columnMap.drawing;
  const spoolCol = columnMap.spool;
  if (drawingCol < 0) return { items: [] };

  const items: ImportedItem[] = [];
  const seen = new Set<string>();
  let blankStreak = 0;
  for (let r = rowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const drawing = String(safeCell(row, drawingCol) ?? '').trim();
    const spool = String(safeCell(row, spoolCol) ?? '')
      .trim()
      .toUpperCase();
    if (!drawing && !spool) {
      if (++blankStreak >= 2) break;
      continue;
    }
    blankStreak = 0;
    if (!drawing) continue;
    if (!looksLikeCode(drawing)) continue;
    const k = `${drawing}|${spool}`;
    if (seen.has(k)) continue;
    seen.add(k);
    items.push({
      drawing,
      spool,
      isoNumber: textCell(row, columnMap.isoNumber),
      project: textCell(row, columnMap.project),
      diameter: textCell(row, columnMap.diameter),
      paintSpec: textCell(row, columnMap.paintSpec),
      ral: textCell(row, columnMap.ral),
      chClean: textCell(row, columnMap.chClean),
      remark: textCell(row, columnMap.remark),
    });
  }
  return { items, detectedHeader: header, columnMap };
}

function safeCell(row: unknown[], idx: number): unknown {
  if (idx < 0 || idx >= row.length) return undefined;
  return row[idx];
}

function textCell(row: unknown[], idx: number): string | undefined {
  const v = safeCell(row, idx);
  if (v === undefined || v === null || v === '') return undefined;
  return String(v).trim();
}

function findHeader(rows: unknown[][]):
  | {
      rowIdx: number;
      header: string[];
      columnMap: Record<keyof ImportedItem, number>;
    }
  | null {
  const maxScan = Math.min(rows.length, 30);
  for (let r = 0; r < maxScan; r++) {
    const row = rows[r];
    if (!row) continue;
    const stringRow = row.map((c) => (c == null ? '' : String(c)));
    const columnMap: Record<keyof ImportedItem, number> = {
      drawing: -1,
      spool: -1,
      isoNumber: -1,
      project: -1,
      diameter: -1,
      paintSpec: -1,
      ral: -1,
      chClean: -1,
      remark: -1,
    };
    for (let c = 0; c < stringRow.length; c++) {
      const cell = stringRow[c].trim();
      if (!cell) continue;
      for (const [field, candidates] of Object.entries(standardFieldHeaders) as [
        keyof ImportedItem,
        string[],
      ][]) {
        if (columnMap[field] === -1 && matchHeader(cell, candidates)) {
          columnMap[field] = c;
          break;
        }
      }
    }
    if (columnMap.drawing >= 0) {
      return { rowIdx: r, header: stringRow, columnMap };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export async function parseCsv(text: string): Promise<ImportResult> {
  // Convert CSV to a 2D array via SheetJS, then run the same structured parser.
  const wb = XLSX.read(text, { type: 'string' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { items: [] };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  });
  const structured = parseStructured(rows);
  if (structured.items.length > 0) return structured;
  // Loose fallback for CSVs without recognisable headers.
  const seen = new Set<string>();
  const items: ImportedItem[] = [];
  for (const row of rows) {
    for (const cell of row) {
      const s = cell == null ? '' : String(cell).trim();
      if (!looksLikeCode(s)) continue;
      if (!new RegExp(DEFAULT_CODE_PATTERN.source).test(s)) continue;
      if (!seen.has(s)) {
        seen.add(s);
        items.push({ drawing: s, spool: '' });
      }
    }
  }
  return { items };
}

// ---------------------------------------------------------------------------
// Photo (lazy-loaded Tesseract)
// ---------------------------------------------------------------------------

export async function parsePhoto(blob: Blob): Promise<ImportResult> {
  const { recognizeImage } = await import('./ocr');
  const text = await recognizeImage(blob);
  const seen = new Set<string>();
  const items: ImportedItem[] = [];
  const re = new RegExp(DEFAULT_CODE_PATTERN.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!seen.has(m[0])) {
      seen.add(m[0]);
      items.push({ drawing: m[0], spool: '' });
    }
  }
  if (items.length === 0) {
    const loose = /\b[A-Z0-9]+(?:-[A-Z0-9]+){2,}\b/g;
    let lm: RegExpExecArray | null;
    while ((lm = loose.exec(text.toUpperCase())) !== null) {
      if (!seen.has(lm[0])) {
        seen.add(lm[0]);
        items.push({ drawing: lm[0], spool: '' });
      }
    }
  }
  return { items };
}
