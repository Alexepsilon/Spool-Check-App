// OCR via Tesseract.js. Lazy-loaded so the main bundle stays small —
// importers.ts dynamically imports this file only when a photo route is
// actually used.
//
// Tesseract downloads its WASM and language data on first use; the
// Service Worker (configured in vite.config.ts) caches those so OCR
// works offline after one online run.

import Tesseract from 'tesseract.js';

let workerPromise: Promise<Tesseract.Worker> | null = null;
let workerStatus: 'init' | 'ready' | 'error' = 'init';
let workerError: string | null = null;

export function getWorkerStatus(): { status: typeof workerStatus; error: string | null } {
  return { status: workerStatus, error: workerError };
}

async function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      try {
        const worker = await Tesseract.createWorker(['eng', 'nld'], 1, {
          logger: () => {
            // Silenced — we don't surface progress per call.
          },
        });
        // Default page segmentation (auto, no OSD). The previous custom
        // PSM choices (1 = page+OSD, 6 = single block) both turned out
        // to misbehave on small tag images — silent empties with PSM 1,
        // overzealous merging with PSM 6. Default PSM 3 has been the
        // most reliable in real testing.
        await worker.setParameters({
          tessedit_char_whitelist:
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-./: |&',
        });
        workerStatus = 'ready';
        return worker;
      } catch (e) {
        workerStatus = 'error';
        workerError = (e as Error).message;
        throw e;
      }
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
