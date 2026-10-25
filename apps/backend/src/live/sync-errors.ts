/**
 * Whether a failed sink or source call hit the whole target (file locked or missing, Google down or refusing our
 * credentials, ...) rather than one sheet or range. A whole-target error is backed off once for the batch;
 * trying every bout alone would only repeat the same failing load/save or call.
 */
export function isWholeTargetError(error: unknown): boolean {
  const flagged = (error as { wholeTarget?: unknown } | null)?.wholeTarget;
  if (typeof flagged === "boolean") return flagged;
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "EBUSY" || code === "EPERM" || code === "EACCES" || code === "ENOENT") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /^File not found/i.test(message);
}
