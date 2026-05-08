// Template-based OCR scan.
//
// Given a photo of a tag and a saved Template (with normalized field
// boxes), this:
//   1. Loads the photo into a canvas.
//   2. For each field box on the template, crops to that region and
//      applies the same grayscale + contrast preprocessing the live
//      scanner uses.
//   3. Runs OCR on each cropped region independently.
//   4. Returns the per-field text plus a derived (drawing, spool) tuple.
//
// Why this is more reliable than full-image OCR: Tesseract's main
// failure modes are (a) confusing surrounding noise as text and (b)
// merging unrelated text into garbled lines. Cropping to known field
// boxes eliminates both, and the per-field expected pattern (drawing
// vs single-letter spool) lets us reject obvious misreads.

import { recognizeCanvas } from './ocr';
import type { Template, TemplateFieldKind } from './types';
import { CodeMatcher } from './matcher';
import { DEFAULT_CODE_PATTERN } from './constants';

export interface TemplateScanResult {
  /** Per-field raw OCR text. Keyed by field kind. */
  fields: Partial<Record<TemplateFieldKind, string>>;
  /** Best-effort (drawing, spool) extraction from the field results. */
  drawing: string;
  spool: string;
}

export async function scanWithTemplate(
  file: File | Blob,
  template: Template,
): Promise<TemplateScanResult> {
  const img = await loadImage(file);
  const result: TemplateScanResult = { fields: {}, drawing: '', spool: '' };

  for (const field of template.fields) {
    const cropped = cropAndProcess(img, field.x, field.y, field.w, field.h);
    if (!cropped) continue;
    const text = (await recognizeCanvas(cropped)).trim();
    result.fields[field.kind] = text;
  }

  // Derive drawing + spool with each field's expected pattern.
  if (result.fields.drawing) {
    const m = new RegExp(DEFAULT_CODE_PATTERN.source, 'g').exec(
      result.fields.drawing.toUpperCase(),
    );
    if (m) result.drawing = m[0];
  }
  if (result.fields.spool) {
    const letter = CodeMatcher.firstLoneLetter(result.fields.spool.toUpperCase());
    if (letter) result.spool = letter;
  }

  return result;
}

function loadImage(blob: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/**
 * Crop the source image to a normalized [x, y, w, h] rectangle and
 * apply grayscale + contrast preprocessing. Returns the canvas,
 * which Tesseract can OCR directly.
 */
function cropAndProcess(
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): HTMLCanvasElement | null {
  const sx = Math.floor(x * img.naturalWidth);
  const sy = Math.floor(y * img.naturalHeight);
  const sw = Math.floor(w * img.naturalWidth);
  const sh = Math.floor(h * img.naturalHeight);
  if (sw <= 4 || sh <= 4) return null;

  // Upsample small crops so Tesseract has enough pixels to work with.
  // Spool boxes especially can be tiny — a 30×30 region OCRs much better
  // when blown up to ~150×150.
  const minDim = 200;
  const scale = Math.max(1, minDim / Math.min(sw, sh));
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // High-quality scaling.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);

  // Grayscale + contrast for better OCR.
  const data = ctx.getImageData(0, 0, dw, dh);
  const d = data.data;
  const contrast = 1.6;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let v = (gray - 128) * contrast + 128;
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}
