// Wrapper around navigator.vibrate — silent no-op on devices without it
// (desktop, Safari) so callers don't need to feature-check.

export function pulseShort(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(50);
  }
}

export function pulseDouble(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([50, 60, 50]);
  }
}

export function pulseLong(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(200);
  }
}
