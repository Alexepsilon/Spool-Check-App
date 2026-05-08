// App-wide constants. Mirror lib/utils/constants.dart from the Flutter
// prototype. Tweak after field testing.

/**
 * Default drawing-number regex.
 *
 * Real-world tag formats observed:
 *   - 7-part: `322-FLA-1001-SS-100-P-2`, `322-GAS-0206-SS-80-N-1.2`
 *   - 6-part: `321-OIL-0108-SS-15-T`     (XYCLE / MOH yellow tags)
 *
 * Generalised pattern: starts with 3 digits (area), followed by 3 to 6
 * dash-separated alphanumeric chunks, each 1–6 chars, with optional
 * `.N` decimal revision suffix. Permissive enough to catch both shapes
 * and similar variants seen in the field, restrictive enough to ignore
 * dates, single-segment numbers, and free text.
 */
export const DEFAULT_CODE_PATTERN =
  /\b\d{3}(?:-[A-Z0-9]{1,6}(?:\.\d+)?){3,6}\b/g;

/**
 * Anchors on the physical tag for `(drawing, spool)` field extraction.
 *
 * Tags can be in Dutch or English (or mixed). Both vocabularies are
 * listed; the matcher tries each anchor as a substring of each line, so
 * "SPOOLNR:" still matches the "SPOOL" anchor, and "TEKENINGNUMMER"
 * still matches "TEK" or "TEKENING".
 */
export const DRAWING_ANCHORS = [
  // Dutch
  'TEKENINGNUMMER',
  'TEKENING NR',
  'TEKENING NUMMER',
  'TEKENING',
  'TEK NR',
  'TEK.NR',
  'TEKNR',
  'TEK',
  // English
  'DRAWING NO',
  'DRAWING NUMBER',
  'DRAWING',
  'DRG NO',
  'DRG.NO',
  'DWG NO',
  'DWG',
  'DRG',
];

export const SPOOL_ANCHORS = [
  // Dutch
  'SPOOLNR',
  'SPOOL NR',
  'SPOOL NUMMER',
  'SPOOL LETTER',
  'STUK',
  // English
  'SPOOL',
  'PIECE NO',
  'PIECE',
  'S/N',
];

/**
 * Header strings for Excel column auto-detection (case-insensitive).
 *
 * Same list covers Dutch and English files, plus common abbreviations.
 * The header matcher uses substring matching so e.g. "Tekeningnummer"
 * also satisfies "tekening".
 */
export const DRAWING_HEADERS = [
  // English
  'drawing no',
  'drawing no.',
  'drawing number',
  'drawing',
  'dwg',
  'dwg no',
  'iso number',
  'iso no',
  // Dutch
  'tekening',
  'tekeningnummer',
  'tekening nr',
  'tekening nummer',
  'tek nr',
  'tek.nr',
  'tek nummer',
];

export const SPOOL_HEADERS = [
  // English
  'spool',
  'spool no',
  'spool number',
  'spool letter',
  'piece',
  'piece no',
  // Dutch
  'spoolnr',
  'spoolnummer',
  'stuk',
];

/**
 * How many consecutive OCR frames must agree before we commit a tick.
 *
 * 2 = quick to commit but more vulnerable to one-off OCR mistakes.
 * 3 = slower (~750 ms hold) but kills almost all single-frame errors.
 *
 * With the crop + grayscale + contrast preprocessing in place,
 * Tesseract is producing more consistent results, so 2 is a
 * reasonable default. Bump back to 3 if false positives appear.
 */
export const FRAME_CONSENSUS_COUNT = 2;
export const FRAME_CONSENSUS_WINDOW = 5;

/** Rate limit for committing the same scan key twice. */
export const SCAN_DEBOUNCE_MS = 4000;

/** Minimum gap between OCR runs (~5 fps). */
export const OCR_FRAME_INTERVAL_MS = 250;

/** Substitution map for common OCR misreads on industrial tags. */
export const OCR_AMBIGUITY: Record<string, string> = {
  O: '0',
  Q: '0',
  D: '0',
  I: '1',
  L: '1',
  '|': '1',
  Z: '2',
  S: '5',
  B: '8',
};
