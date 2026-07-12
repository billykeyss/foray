import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { serve } from "@hono/node-server";
import { readConfig, type ServerConfig } from "./config.ts";
import { safeEqual } from "./auth.ts";
import { createLimiter, CHAT_LIMITS, type Limiter } from "./rate-limit.ts";
import { proxyMessages } from "./proxy.ts";
import { serveStatic } from "./static.ts";

export interface AppDeps {
  upstreamFetch?: typeof fetch;
  limiter?: Limiter;
}

export function buildApp(cfg: ServerConfig, deps: AppDeps = {}): Hono {
  const app = new Hono();
  const limiter = deps.limiter ?? createLimiter(CHAT_LIMITS);

  /** Chat gate (mirrors keeper's keeperAuth + chatConfigured): 503 when the
   *  server has no key/password; rate-limit BEFORE the password check so
   *  failed attempts consume the window (brute-force bound); constant-time
   *  compare; 401 otherwise. */
  const gate: MiddlewareHandler = async (c, next) => {
    if (!cfg.apiKey || !cfg.password) return c.json({ error: "chat not configured" }, 503);
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    // Global cap can briefly starve a fresh IP while others are busy —
    // accepted trade-off (Keeper's) for a small tailnet audience.
    if (!limiter.allow(ip)) return c.json({ error: "rate limited" }, 429);
    const got = c.req.header("x-foray-password") ?? "";
    if (!safeEqual(got, cfg.password)) return c.json({ error: "unauthorized" }, 401);
    return next();
  };

  app.get("/api/chat/auth/check", gate, (c) => c.body(null, 204));
  app.post("/api/chat/proxy/v1/messages", gate, async (c) => {
    try {
      return await proxyMessages(c.req.raw, cfg.apiKey as string, deps.upstreamFetch);
    } catch {
      // Upstream network failure — keep the API's JSON error shape and avoid
      // Hono's default plaintext 500 + stack-trace console spam.
      return c.json({ error: "upstream unreachable" }, 502);
    }
  });
  app.all("/api/*", (c) => c.json({ error: "not found" }, 404));
  app.get("*", (c) => serveStatic(cfg.outDir, new URL(c.req.url).pathname));
  return app;
}

// Entrypoint: `node --experimental-strip-types server/index.ts`
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() as string)) {
  const cfg = readConfig();
  const configured = cfg.apiKey && cfg.password ? "password-gated chat ON" : "chat NOT configured (503)";
  serve({ fetch: buildApp(cfg).fetch, port: cfg.port }, () => {
    console.log(`[foray] serving ${cfg.outDir} on :${cfg.port} — ${configured}`);
  });
}
