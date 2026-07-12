/** In-memory sliding-window limiter (single-process server, mirrors keeper
 *  src/api/chat.ts). Counts every gated request — including failed password
 *  attempts — so it also brute-force-limits the gate. */
export interface Limiter {
  allow(ip: string, now?: number): boolean;
  reset(): void;
}

export function createLimiter(opts: { windowMs: number; perIpMax: number; globalMax: number }): Limiter {
  let hits: Array<{ ip: string; at: number }> = [];
  return {
    allow(ip: string, now: number = Date.now()): boolean {
      const cutoff = now - opts.windowMs;
      hits = hits.filter((h) => h.at > cutoff);
      if (hits.length >= opts.globalMax) return false;
      if (hits.filter((h) => h.ip === ip).length >= opts.perIpMax) return false;
      hits.push({ ip, at: now });
      return true;
    },
    reset() {
      hits = [];
    },
  };
}

export const CHAT_LIMITS = { windowMs: 60_000, perIpMax: 10, globalMax: 30 };
