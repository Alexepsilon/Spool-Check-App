// Match OCR text against a master list of (drawing, spool) pairs.
//
// Two extraction passes per frame:
//
//   1. Anchor-based: find labels like "TEK NR" / "SPOOL" on the card,
//      read the value adjacent to each label. Robust on busy tags.
//
//   2. Regex fallback: pull the first thing that matches the
//      drawing-number regex; scan its line for a lone uppercase letter
//      to use as the spool. Catches tags where label OCR fails.
//
// Either way, results land in the master set keyed by composite
// `(drawing, spool)`. Fuzzy fallback substitutes O↔0, I↔1, S↔5 etc.
// when strict comparison misses by one character.

import {
  DEFAULT_CODE_PATTERN,
  DRAWING_ANCHORS,
  SPOOL_ANCHORS,
} from './constants';
import { composeKey } from './types';

export type MatchConfidence = 'exact' | 'fuzzy' | 'partial';

export interface MasterEntry {
  drawing: string;
  spool: string;
  itemId: string; // master_items row ID, so the caller can mark it directly.
}

export interface MatchResult {
  drawing: string;
  spool: string;
  observed: string;
  confidence: MatchConfidence;
  itemId?: string;
  /** When confidence === 'partial', the spool letters available for the
   *  matched drawing so the UI can offer a picker. */
  availableSpools?: string[];
}

export class CodeMatcher {
  private readonly pattern: RegExp;
  private readonly entries: Map<string, MasterEntry>; // composite key -> entry
  private readonly normalisedToKey: Map<string, string>;

  constructor(entries: MasterEntry[], customPattern?: string) {
    this.pattern = customPattern
      ? new RegExp(customPattern, 'g')
      : new RegExp(DEFAULT_CODE_PATTERN.source, 'g');
    this.entries = new Map();
    this.normalisedToKey = new Map();
    for (const e of entries) {
      const k = composeKey(e.drawing, e.spool);
      this.entries.set(k, e);
      this.normalisedToKey.set(CodeMatcher.normalise(k), k);
    }
  }

  /** Uppercase, swap ambiguous chars to their digit form. */
  static normalise(input: string): string {
    return input
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/O/g, '0')
      .replace(/Q/g, '0')
      .replace(/D/g, '0')
      .replace(/I/g, '1')
      .replace(/L/g, '1')
      .replace(/\|/g, '1')
      .replace(/Z/g, '2')
      .replace(/S/g, '5')
      .replace(/B/g, '8');
  }

  /**
   * Run anchor extraction + regex fallback against an OCR text block,
   * resolve each candidate to a master entry, and return
   * dedup'd results.
   */
  match(ocrText: string): MatchResult[] {
    if (!ocrText || ocrText.length === 0) return [];
    const upper = ocrText.toUpperCase();
    const hits = new Set<string>();
    const results: MatchResult[] = [];

    // -------- Anchor-based --------
    const extracted = this.extractAnchored(upper);
    for (const pair of extracted) {
      const r = this.resolve(pair.drawing, pair.spool, hits);
      if (r) results.push(r);
    }

    // -------- Regex fallback --------
    // Reset lastIndex because the pattern is /g.
    const re = new RegExp(this.pattern.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(upper)) !== null) {
      const drawing = m[0];
      const lineSpool = this.spoolOnLineNear(upper, m.index);
      const r = this.resolve(drawing, lineSpool, hits);
      if (r) results.push(r);
    }

    return results;
  }

  // ---------------- private ----------------

  private extractAnchored(upper: string): { drawing: string; spool: string }[] {
    const lines = upper.split(/[\r\n]+/);
    let drawing: string | undefined;
    let spool: string | undefined;
    const drawingRegex = new RegExp(this.pattern.source);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!drawing) {
        for (const anchor of DRAWING_ANCHORS) {
          const idx = line.indexOf(anchor);
          if (idx >= 0) {
            const tail = line.slice(idx + anchor.length);
            const tm = drawingRegex.exec(tail);
            if (tm) {
              drawing = tm[0];
              break;
            }
            if (i + 1 < lines.length) {
              const nm = drawingRegex.exec(lines[i + 1]);
              if (nm) {
                drawing = nm[0];
                break;
              }
            }
          }
        }
      }
      if (!spool) {
        for (const anchor of SPOOL_ANCHORS) {
          const idx = line.indexOf(anchor);
          if (idx >= 0) {
            const tail = line.slice(idx + anchor.length);
            const letter = CodeMatcher.firstLoneLetter(tail);
            if (letter) {
              spool = letter;
              break;
            }
            if (i + 1 < lines.length) {
              const letter2 = CodeMatcher.firstLoneLetter(lines[i + 1]);
              if (letter2) {
                spool = letter2;
                break;
              }
            }
          }
        }
      }
      if (drawing && spool) break;
    }

    return drawing ? [{ drawing, spool: spool ?? '' }] : [];
  }

  static firstLoneLetter(s: string): string | undefined {
    const m = /(?<![A-Z0-9])([A-Z])(?![A-Z0-9])/.exec(s);
    return m?.[1];
  }

  private spoolOnLineNear(upper: string, offset: number): string | undefined {
    const start = upper.lastIndexOf('\n', offset) + 1;
    let end = upper.indexOf('\n', offset);
    if (end < 0) end = upper.length;
    return CodeMatcher.firstLoneLetter(upper.slice(start, end));
  }

  private resolve(
    drawing: string,
    spool: string | undefined,
    hits: Set<string>,
  ): MatchResult | null {
    const s = (spool ?? '').toUpperCase();
    const exactKey = composeKey(drawing, s);

    const exact = this.entries.get(exactKey);
    if (exact) {
      if (hits.has(exactKey)) return null;
      hits.add(exactKey);
      return {
        drawing: exact.drawing,
        spool: exact.spool,
        observed: drawing,
        confidence: 'exact',
        itemId: exact.itemId,
      };
    }

    if (s.length === 0) {
      const drawOnly = this.entries.get(drawing);
      if (drawOnly) {
        if (hits.has(drawing)) return null;
        hits.add(drawing);
        return {
          drawing: drawOnly.drawing,
          spool: drawOnly.spool,
          observed: drawing,
          confidence: 'exact',
          itemId: drawOnly.itemId,
        };
      }
    }

    // Drawing matches some master row but spool is wrong/unknown — partial.
    if (s.length > 0) {
      const available: string[] = [];
      for (const [key, entry] of this.entries) {
        if (key.startsWith(`${drawing}|`)) {
          available.push(entry.spool);
        }
      }
      if (available.length > 0) {
        return {
          drawing,
          spool: s,
          observed: drawing,
          confidence: 'partial',
          availableSpools: available.sort(),
        };
      }
    }

    // Last shot: fuzzy on the composite key.
    const fuzzyKey = this.normalisedToKey.get(CodeMatcher.normalise(exactKey));
    if (fuzzyKey) {
      const entry = this.entries.get(fuzzyKey)!;
      if (hits.has(fuzzyKey)) return null;
      hits.add(fuzzyKey);
      return {
        drawing: entry.drawing,
        spool: entry.spool,
        observed: drawing,
        confidence: 'fuzzy',
        itemId: entry.itemId,
      };
    }

    return null;
  }
}
