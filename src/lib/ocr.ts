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

/**
 * Drives all OCR. Loading is split into two phases — `init` while we
 * download Tesseract's WASM and language data (~5 MB), then `ready`
 * once the worker is set up. Callers can poll `getWorkerStatus()` to
 * surface progress in the UI.
 *
 * Eng-only: `nld.traineddata` doubled the download size and Dutch
 * isn't actually needed since the matcher reads raw uppercase strings
 * — Tesseract's English model recognises the same Latin letters
 * regardless of the original language of the labels.
 */
async function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerStatus = 'init';
    workerError = null;
    workerProgress = 0;
    workerPromise = (async () => {
      try {
        const worker = await Tesseract.createWorker('eng', 1, {
          logger: (m) => {
            if (typeof m.progress === 'number') {
              workerProgress = m.progress;
            }
          },
        });
        await worker.setParameters({
          tessedit_char_whitelist:
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-./: |&',
        });
        workerStatus = 'ready';
        workerProgress = 1;
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

let workerProgress = 0;
export function getWorkerProgress(): number {
  return workerProgress;
}

/** Eagerly start loading Tesseract — call from the Scanner page on mount
 *  so the download has a head start before the user actually scans. */
export function preloadWorker(): void {
  void getWorker().catch(() => {
    // Errors surface via getWorkerStatus(); nothing to do here.
  });
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
