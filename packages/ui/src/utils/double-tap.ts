const DOUBLE_TAP_THRESHOLD_MS = 320;

export function registerDoubleTap(
  target: EventTarget,
  handler: (event: MouseEvent) => void,
  signal: AbortSignal,
): void {
  let lastTap = 0;

  target.addEventListener(
    "click",
    (event) => {
      const now = Date.now();
      if (now - lastTap < DOUBLE_TAP_THRESHOLD_MS) {
        lastTap = 0;
        handler(event as MouseEvent);
        return;
      }

      lastTap = now;
    },
    { signal },
  );
}
