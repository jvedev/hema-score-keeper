/** Translate as in @hema/ui (injected so this stays testable without the DOM). */
export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** The error screen while the ring is reloaded by itself: "Can't reach the server — retrying…" and what is not sent yet. */
export function loadRetryText(unsent: number, translate: Translate): string {
  return unsent > 0 ? `${translate("ring.retrying")} · ${translate("ring.notSent", { count: unsent })}` : translate("ring.retrying");
}

/** The "vs" between the names and the doubles note (empty for none) on a ring bout row. */
export function boutRowText(doubles: number, translate: Translate): { vs: string; doubles: string } {
  const count = Number(doubles) || 0;
  return {
    vs: translate("ring.vs"),
    doubles: count === 0 ? "" : count === 1 ? translate("ring.doublesOne") : translate("ring.doubles", { count }),
  };
}
