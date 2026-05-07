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
