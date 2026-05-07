// OCR via Tesseract.js. Lazy-loaded so the main bundle stays small —
// importers.ts dynamically imports this file only when a photo route is
// actually used.
//
// Tesseract downloads its WASM and language data on first use; the
// Service Worker (configured in vite.config.ts) caches those so OCR
// works offline after one online run.

import Tesseract from 'tesseract.js';

let workerPromise: Promise<Tesseract.Worker> | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await Tesseract.createWorker(['eng', 'nld'], 1, {
        logger: () => {
          // Silenced — we don't surface progress per call.
        },
      });
      // Limit charset to make OCR faster and more accurate on tag-like text.
      await worker.setParameters({
        tessedit_char_whitelist:
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-./: |&',
      });
      return worker;
    })();
  }
  return workerPromise;
}

/** OCR a Blob (image file) and return the recognised text. */
export async function recognizeImage(blob: Blob): Promise<string> {
  const worker = await getWorker();
  const url = URL.createObjectURL(blob);
  try {
    const { data } = await worker.recognize(url);
    return data.text ?? '';
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** OCR a still frame from a video element / canvas. */
export async function recognizeCanvas(
  canvas: HTMLCanvasElement,
): Promise<string> {
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  return data.text ?? '';
}

/** Free Tesseract resources. Call on app shutdown if you want to be tidy;
 *  PWAs typically don't need to. */
export async function disposeWorker(): Promise<void> {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate();
    workerPromise = null;
  }
}
