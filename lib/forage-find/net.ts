/** Network helpers for Forage Finder: every request gets a hard timeout so a stalled host reads as
 *  "unavailable" instead of hanging the search (NetworkFirst only times out when a cached copy exists). */

export const FETCH_TIMEOUT_MS = 9000;

/** A signal that aborts when `parent` aborts or after `ms`, whichever comes first. */
export function timedSignal(parent: AbortSignal | undefined, ms: number = FETCH_TIMEOUT_MS): AbortSignal {
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  const hasTimeout = typeof (AbortSignal as unknown as { timeout?: unknown }).timeout === "function";
  if (any && hasTimeout) return any(parent ? [parent, AbortSignal.timeout(ms)] : [AbortSignal.timeout(ms)]);
  // Fallback for older engines.
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new DOMException("Timed out", "TimeoutError")), ms);
  if (parent) {
    if (parent.aborted) ac.abort(parent.reason);
    else parent.addEventListener("abort", () => ac.abort(parent.reason), { once: true });
  }
  ac.signal.addEventListener("abort", () => clearTimeout(t), { once: true });
  return ac.signal;
}
