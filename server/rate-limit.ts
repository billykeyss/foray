/** In-memory sliding-window limiter (single-process server, mirrors keeper
 *  src/api/chat.ts). Requests that clear the limiter are recorded whether or
 *  not the password check then succeeds, so failed password attempts consume
 *  the window and the gate is brute-force-limited to perIpMax attempts/min. */
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
