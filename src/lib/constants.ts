// App-wide constants. Mirror lib/utils/constants.dart from the Flutter
// prototype. Tweak after field testing.

/** Default drawing-number regex: matches `322-FLA-1001-SS-100-P-2` and friends. */
export const DEFAULT_CODE_PATTERN =
  /\b\d{3}-[A-Z0-9]{2,4}-\d{3,4}(?:\.\d+)?-[A-Z0-9]{2}-\d{1,3}-[A-Z]-\d+(?:\.\d+)?\b/g;

/** Anchors on the physical tag for `(drawing, spool)` field extraction. */
export const DRAWING_ANCHORS = [
  'TEK NR',
  'TEK.NR',
  'TEKNR',
  'TEKENING',
  'TEK',
  'DRAWING',
  'DRG NO',
  'DRG.NO',
  'DWG',
];

export const SPOOL_ANCHORS = ['SPOOL', 'PIECE', 'S/N'];

/** Header strings for Excel column auto-detection (case-insensitive). */
export const DRAWING_HEADERS = [
  'drawing no',
  'drawing no.',
  'drawing number',
  'drawing',
  'tek nr',
  'tek.nr',
  'tekening',
  'iso number',
  'iso no',
];

export const SPOOL_HEADERS = ['spool', 'spool no', 'piece', 'piece no'];

/** How many consecutive OCR frames must agree before we commit a tick. */
export const FRAME_CONSENSUS_COUNT = 3;
export const FRAME_CONSENSUS_WINDOW = 6;

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
