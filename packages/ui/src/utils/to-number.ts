/** Numbers from stored JSON can be anything; anything that isn't a finite number becomes `fallback` before it reaches HTML. */
export function toNumber(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : fallback;
}
