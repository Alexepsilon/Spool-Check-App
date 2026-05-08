// Tiny wrapper around getUserMedia + a hidden canvas for frame capture.
//
// We snapshot the live <video> into the canvas at a throttled rate and
// hand the canvas to Tesseract. Snapshotting is much cheaper than
// allocating a Blob per frame.

export interface CameraHandle {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  stream: MediaStream;
  stop: () => void;
}

export async function startBackCamera(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): Promise<CameraHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return {
    video,
    canvas,
    stream,
    stop() {
      stream.getTracks().forEach((t) => t.stop());
      if (video.srcObject) video.srcObject = null;
    },
  };
}

/** Draw the current video frame into the canvas at the video's intrinsic
 *  resolution and return the canvas. Caller can hand it to Tesseract. */
export function captureFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): HTMLCanvasElement | null {
  if (video.readyState < 2 || video.videoWidth === 0) return null;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Crop the central reticle region of [src] into [dest] and apply
 * grayscale + contrast boost. OCR accuracy on industrial tags improves
 * dramatically with this preprocessing — Tesseract was trained on
 * clean black-on-white documents, not color photos with background
 * noise.
 *
 * Crop window roughly matches the on-screen reticle proportions
 * (centered, ~75% wide × 45% tall of the camera frame).
 */
export function cropAndPreprocess(
  src: HTMLCanvasElement,
  dest: HTMLCanvasElement,
): HTMLCanvasElement | null {
  if (src.width === 0 || src.height === 0) return null;
  const cropW = Math.floor(src.width * 0.75);
  const cropH = Math.floor(src.height * 0.45);
  const cropX = Math.floor((src.width - cropW) / 2);
  const cropY = Math.floor((src.height - cropH) / 2);

  dest.width = cropW;
  dest.height = cropH;
  const ctx = dest.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(src, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // Pixel-level pass: grayscale + contrast stretch.
  // Tesseract performs substantially better on high-contrast monochrome.
  const img = ctx.getImageData(0, 0, cropW, cropH);
  const d = img.data;
  const contrast = 1.6;
  for (let i = 0; i < d.length; i += 4) {
    // Luminosity grayscale.
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // Contrast around 128 midpoint.
    let v = (gray - 128) * contrast + 128;
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return dest;
}

/** Try to enable the device torch (flashlight) on the given stream.
 *  Best-effort: many phones / browsers don't expose this. */
export async function setTorch(
  stream: MediaStream,
  on: boolean,
): Promise<boolean> {
  const track = stream.getVideoTracks()[0];
  if (!track) return false;
  const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
  if (!caps.torch) return false;
  try {
    await track.applyConstraints({
      advanced: [{ torch: on } as MediaTrackConstraintSet & { torch: boolean }],
    });
    return true;
  } catch {
    return false;
  }
}
