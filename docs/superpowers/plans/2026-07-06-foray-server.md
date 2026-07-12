# Foray Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Foray as one supervised Hono process on the Mac mini that serves the untouched static export and hosts a password-gated streaming proxy to the Anthropic API, per `docs/superpowers/specs/2026-07-06-foray-server-design.md`.

**Architecture:** New `server/` (TypeScript, run via `node --experimental-strip-types`) with four small modules — auth, rate-limit, proxy, static — wired by a `buildApp(cfg, deps)` factory that tests exercise through Hono's `app.request()`. Client side: the chat agent gains a `ChatAuth` union (BYO key vs password→proxy), and the panel probes `/api/chat/auth/check` on mount to pick its mode. Ops mirror Keeper's tmux + launchd playbook, minus Docker/Postgres.

**Tech Stack:** Hono + `@hono/node-server` (only new deps), node:test, existing `@anthropic-ai/sdk` client.

**Branch:** `feat/foray-server` (spec committed). Do NOT push. The working tree contains ANOTHER session's uncommitted changes (forecast/burn-window files) — stage ONLY your task's files, never `git add -A`.

**Repo conventions:** lib-internal imports carry explicit `.ts` extensions; `lib/chat/*` and `server/*` must be importable by `node --test --experimental-strip-types` (no JSX; SDK import allowed ONLY in `lib/chat/agent.ts`); tests live in `scripts/*.test.mjs`; run one file with `node --test --experimental-strip-types scripts/server.test.mjs`.

**Keeper reference files (same machine, read them when in doubt):** `~/projects/fishing-law/src/api/auth.ts` (timing-safe gate), `~/projects/fishing-law/src/api/chat.ts:11-29` (limiter), `~/projects/fishing-law/scripts/keeper-tmux.sh` (supervisor), `~/projects/fishing-law/docs/deploy-mac-mini.md` §4 (launchd plist recipe).

---

### Task 1: Dependencies

**Files:** Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1:** `pnpm add hono @hono/node-server` (repo's lockfile is pnpm — do NOT use npm here).
- [ ] **Step 2:** Verify: `node -e "import('hono').then(m => console.log(!!m.Hono))"` → `true`.
- [ ] **Step 3:** Commit: `git add package.json pnpm-lock.yaml && git commit -m "chore: add hono for the foray server"`

---

### Task 2: Config + auth — `server/config.ts`, `server/auth.ts`

**Files:**
- Create: `server/config.ts`, `server/auth.ts`
- Test: `scripts/server.test.mjs` (new)

- [ ] **Step 1: Write failing tests** — create `scripts/server.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";

import { readConfig } from "../server/config.ts";
import { safeEqual } from "../server/auth.ts";

test("readConfig reads env with defaults and null-for-missing secrets", () => {
  const cfg = readConfig({ PORT: "5000", ANTHROPIC_API_KEY: "sk-x", FORAY_CHAT_PASSWORD: "pw" });
  assert.deepEqual(
    { port: cfg.port, apiKey: cfg.apiKey, password: cfg.password },
    { port: 5000, apiKey: "sk-x", password: "pw" }
  );
  const empty = readConfig({});
  assert.equal(empty.port, 4245);
  assert.equal(empty.apiKey, null);
  assert.equal(empty.password, null);
  assert.ok(empty.outDir.endsWith("/out"));
});

test("safeEqual is correct on equal/unequal/length-mismatch", () => {
  assert.equal(safeEqual("secret", "secret"), true);
  assert.equal(safeEqual("secret", "secreT"), false);
  assert.equal(safeEqual("secret", "secret-longer"), false);
  assert.equal(safeEqual("", ""), true);
});
```

- [ ] **Step 2:** Run `node --test --experimental-strip-types scripts/server.test.mjs` → FAIL (module not found).
- [ ] **Step 3: Implement.** `server/config.ts`:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ServerConfig {
  port: number;
  /** Server-held Anthropic key; null = chat unconfigured (503). */
  apiKey: string | null;
  /** Shared chat password; null = chat unconfigured (503). */
  password: string | null;
  /** Directory of the Next static export. */
  outDir: string;
}

export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return {
    port: Number(env.PORT) || 4245,
    apiKey: env.ANTHROPIC_API_KEY || null,
    password: env.FORAY_CHAT_PASSWORD || null,
    outDir: env.FORAY_OUT_DIR || path.resolve(here, "..", "out"),
  };
}
```

`server/auth.ts` (Keeper's `safeEqual`, verbatim pattern):

```ts
import { timingSafeEqual } from "node:crypto";

/** Constant-time string comparison (mirrors keeper src/api/auth.ts). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
```

- [ ] **Step 4:** Run → PASS (2 tests).
- [ ] **Step 5:** Commit: `git add server/config.ts server/auth.ts scripts/server.test.mjs && git commit -m "feat(server): config + timing-safe password compare"`

---

### Task 3: Rate limiter — `server/rate-limit.ts`

**Files:** Create: `server/rate-limit.ts`; Test: `scripts/server.test.mjs` (append)

- [ ] **Step 1: Append failing tests:**

```js
import { createLimiter } from "../server/rate-limit.ts";

test("limiter enforces per-IP and global sliding windows", () => {
  const lim = createLimiter({ windowMs: 60_000, perIpMax: 2, globalMax: 3 });
  let t = 1_000_000;
  assert.equal(lim.allow("a", t), true);
  assert.equal(lim.allow("a", t + 1), true);
  assert.equal(lim.allow("a", t + 2), false); // per-IP cap
  assert.equal(lim.allow("b", t + 3), true);
  assert.equal(lim.allow("c", t + 4), false); // global cap (3 recorded)
  assert.equal(lim.allow("a", t + 61_000), true); // window expired
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implement** `server/rate-limit.ts` (Keeper's limiter shape, injectable clock):

```ts
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
```

- [ ] **Step 4:** Run → PASS. **Step 5:** Commit: `git add server/rate-limit.ts scripts/server.test.mjs && git commit -m "feat(server): sliding-window rate limiter"`

---

### Task 4: Proxy — `server/proxy.ts`

**Files:** Create: `server/proxy.ts`; Test: `scripts/server.test.mjs` (append)

- [ ] **Step 1: Append failing tests:**

```js
import { proxyMessages, ANTHROPIC_URL } from "../server/proxy.ts";

function fakeUpstream(capture, response) {
  return async (url, init) => {
    capture.url = url;
    capture.init = init;
    return response;
  };
}

test("proxyMessages injects the server key, allowlists headers, passes body", async () => {
  const req = new Request("http://x/api/chat/proxy/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "some-beta",
      "x-api-key": "client-placeholder",
      "x-foray-password": "pw",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: "claude-sonnet-5" }),
  });
  const cap = {};
  const res = await proxyMessages(req, "sk-server-key", fakeUpstream(cap, new Response("{}", { status: 200, headers: { "content-type": "application/json" } })));
  assert.equal(res.status, 200);
  assert.equal(cap.url, ANTHROPIC_URL);
  assert.equal(cap.init.headers.get("x-api-key"), "sk-server-key");
  assert.equal(cap.init.headers.get("anthropic-beta"), "some-beta");
  assert.equal(cap.init.headers.get("x-foray-password"), null);
  assert.equal(cap.init.headers.get("anthropic-dangerous-direct-browser-access"), null);
  assert.equal(JSON.parse(cap.init.body).model, "claude-sonnet-5");
});

test("proxyMessages passes upstream errors and streams through; never echoes the key", async () => {
  const req = new Request("http://x/", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  const upstream = new Response("event: error\ndata: {}\n\n", { status: 429, headers: { "content-type": "text/event-stream" } });
  const res = await proxyMessages(req, "sk-server-key", async () => upstream);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  const text = await res.text();
  assert.ok(!text.includes("sk-server-key"));
  assert.equal(res.headers.get("x-api-key"), null);
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implement** `server/proxy.ts`:

```ts
export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** Headers copied from the client request; everything else — including the
 *  browser SDK's placeholder x-api-key, the password header, and the
 *  direct-browser-access flag — is dropped. Upstream headers are built fresh. */
const ALLOWED_REQ_HEADERS = ["anthropic-version", "anthropic-beta", "content-type"];

export async function proxyMessages(
  req: Request,
  apiKey: string,
  upstreamFetch: typeof fetch = fetch
): Promise<Response> {
  const headers = new Headers();
  headers.set("x-api-key", apiKey);
  for (const name of ALLOWED_REQ_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("anthropic-version")) headers.set("anthropic-version", "2023-06-01");

  // Buffer the body (chat requests are modest JSON) — avoids fetch duplex quirks.
  const body = await req.text();
  const upstream = await upstreamFetch(ANTHROPIC_URL, { method: "POST", headers, body });

  // Stream the upstream body back verbatim; only content-type crosses back.
  const respHeaders = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) respHeaders.set("content-type", ct);
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
}
```

- [ ] **Step 4:** Run → PASS. **Step 5:** Commit: `git add server/proxy.ts scripts/server.test.mjs && git commit -m "feat(server): streaming anthropic proxy with header allowlist"`

---

### Task 5: Static resolution + app wiring — `server/static.ts`, `server/index.ts`

**Files:** Create: `server/static.ts`, `server/index.ts`; Modify: `server/proxy.ts` (rider); Test: `scripts/server.test.mjs` (append)

**Rider from Task 4's review (apply to `server/proxy.ts` in this task's commit):**

1. Body-size cap. Add after `ANTHROPIC_URL`:

```ts
/** Cap buffered request bodies — a malicious password-holder shouldn't be
 *  able to feed the single-process server gigabyte POSTs. */
export const MAX_BODY_BYTES = 2_000_000;
```

At the top of `proxyMessages`, before building headers:

```ts
  const tooLarge = new Response(JSON.stringify({ error: "request too large" }), {
    status: 413,
    headers: { "content-type": "application/json" },
  });
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return tooLarge;
```

And after `const body = await req.text();`: `if (body.length > MAX_BODY_BYTES) return tooLarge.clone();`

2. Response-header passthrough. Replace the content-type-only response header block with:

```ts
  /** Non-sensitive upstream headers worth passing back: content-type for the
   *  stream parser, retry-after* so the SDK's backoff honors Anthropic's
   *  hints, request-id for debuggability. */
  const PASSTHROUGH = [
    "content-type",
    "request-id",
    "retry-after",
    "retry-after-ms",
  ];
  const respHeaders = new Headers();
  for (const name of PASSTHROUGH) {
    const value = upstream.headers.get(name);
    if (value) respHeaders.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
```

3. Rider tests (append with the other proxy tests):

```js
test("proxyMessages caps oversized bodies and passes back retry/request-id headers", async () => {
  const big = new Request("http://x/", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": String(2_000_001) },
    body: "{}",
  });
  const res413 = await proxyMessages(big, "sk", async () => new Response("{}"));
  assert.equal(res413.status, 413);
  const req = new Request("http://x/", { method: "POST", body: "{}" });
  const upstream = new Response("{}", {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": "7", "request-id": "req_123" },
  });
  const res = await proxyMessages(req, "sk", async () => upstream);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "7");
  assert.equal(res.headers.get("request-id"), "req_123");
});
```

- [ ] **Step 1: Append failing tests** (pure candidates fn + full app via `app.request()` with a temp fixture dir):

```js
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { staticCandidates } from "../server/static.ts";
import { buildApp } from "../server/index.ts";

test("staticCandidates maps routes to export files and rejects traversal", () => {
  assert.deepEqual(staticCandidates("/"), ["index.html"]);
  assert.deepEqual(staticCandidates("/chat"), ["chat.html", "chat/index.html"]);
  assert.deepEqual(staticCandidates("/catalog/boletus-edulis"), [
    "catalog/boletus-edulis.html",
    "catalog/boletus-edulis/index.html",
  ]);
  assert.deepEqual(staticCandidates("/sw.js"), ["sw.js"]);
  assert.equal(staticCandidates("/../etc/passwd"), null);
  assert.equal(staticCandidates("/a/%2e%2e/b"), null);
});

function fixtureApp(cfgOverrides = {}, deps = {}) {
  const dir = mkdtempSync(join(tmpdir(), "foray-out-"));
  writeFileSync(join(dir, "index.html"), "<h1>home</h1>");
  writeFileSync(join(dir, "chat.html"), "<h1>chat</h1>");
  writeFileSync(join(dir, "404.html"), "<h1>nope</h1>");
  mkdirSync(join(dir, "_next"), { recursive: true });
  writeFileSync(join(dir, "_next", "a.js"), "js();");
  const cfg = { port: 0, apiKey: "sk-test", password: "pw", outDir: dir, ...cfgOverrides };
  return buildApp(cfg, deps);
}

test("app serves export html mapping, assets, and 404 fallback", async () => {
  const app = fixtureApp();
  assert.equal((await app.request("/")).status, 200);
  const chat = await app.request("/chat");
  assert.equal(chat.status, 200);
  assert.ok((await chat.text()).includes("chat"));
  assert.equal((await app.request("/_next/a.js")).headers.get("content-type"), "text/javascript");
  assert.equal((await app.request("/definitely-missing")).status, 404);
});

test("auth/check: 503 unconfigured, 401 wrong password, 204 right", async () => {
  const un = fixtureApp({ apiKey: null });
  assert.equal((await un.request("/api/chat/auth/check")).status, 503);
  const app = fixtureApp();
  assert.equal((await app.request("/api/chat/auth/check")).status, 401);
  const bad = await app.request("/api/chat/auth/check", { headers: { "x-foray-password": "nope" } });
  assert.equal(bad.status, 401);
  const ok = await app.request("/api/chat/auth/check", { headers: { "x-foray-password": "pw" } });
  assert.equal(ok.status, 204);
});

test("proxy route: gated, rate-limited, forwards via injected upstream", async () => {
  let called = 0;
  const app = fixtureApp({}, {
    upstreamFetch: async () => {
      called++;
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    },
    limiter: { allow: () => true, reset() {} },
  });
  const unauth = await app.request("/api/chat/proxy/v1/messages", { method: "POST", body: "{}" });
  assert.equal(unauth.status, 401);
  assert.equal(called, 0);
  const ok = await app.request("/api/chat/proxy/v1/messages", {
    method: "POST",
    headers: { "x-foray-password": "pw", "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(ok.status, 200);
  assert.equal(called, 1);
});

test("rate limit returns 429 and counts failed password attempts", async () => {
  const lim = { calls: 0, allow() { this.calls++; return this.calls <= 1; }, reset() {} };
  const app = fixtureApp({}, { limiter: lim });
  await app.request("/api/chat/auth/check", { headers: { "x-foray-password": "wrong" } }); // consumes the 1 slot
  const second = await app.request("/api/chat/auth/check", { headers: { "x-foray-password": "pw" } });
  assert.equal(second.status, 429);
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implement.** `server/static.ts`:

```ts
import { promises as fs } from "node:fs";
import path from "node:path";

/** Map a URL path to candidate files inside the Next static export
 *  (foo → foo.html per `output: 'export'` without trailingSlash).
 *  Returns null for traversal attempts. */
export function staticCandidates(urlPath: string): string[] | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  if (decoded.includes("..") || decoded.includes("\0")) return null;
  const trimmed = decoded.replace(/\/+$/, "");
  if (trimmed === "" || trimmed === "/") return ["index.html"];
  const rel = trimmed.replace(/^\/+/, "");
  if (/\.[A-Za-z0-9]+$/.test(rel)) return [rel];
  return [`${rel}.html`, `${rel}/index.html`];
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

export function contentTypeFor(file: string): string {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/** Serve a path from outDir; falls back to 404.html (status 404). */
export async function serveStatic(outDir: string, urlPath: string): Promise<Response> {
  const candidates = staticCandidates(urlPath) ?? [];
  const root = path.resolve(outDir);
  for (const rel of candidates) {
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(root + path.sep) && abs !== root) continue; // belt-and-suspenders
    try {
      const data = await fs.readFile(abs);
      return new Response(data, { status: 200, headers: { "content-type": contentTypeFor(abs) } });
    } catch {
      /* try next candidate */
    }
  }
  try {
    const nf = await fs.readFile(path.join(root, "404.html"));
    return new Response(nf, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
```

`server/index.ts`:

```ts
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
```

(If the entrypoint guard proves brittle under strip-types, replace with an unconditional `serve()` behind `if (process.env.NODE_TEST_CONTEXT === undefined && process.env.FORAY_SERVER_NO_LISTEN !== "1")` — tests import `buildApp` only; report which variant you used.)

- [ ] **Step 4:** Run → PASS (all server tests). Also `npm test` (full suite, expect 98 + new) and `npx tsc --noEmit`.
- [ ] **Step 5:** Commit: `git add server/static.ts server/index.ts scripts/server.test.mjs && git commit -m "feat(server): hono app — gated proxy routes + static export serving"`

---

### Task 6: Client gate module — `lib/chat/gate.ts`

**Files:** Create: `lib/chat/gate.ts`; Test: `scripts/chat.test.mjs` (append)

- [ ] **Step 1: Append failing tests to `scripts/chat.test.mjs`:**

```js
import { probeChatProxy, verifyChatPassword, loadChatPassword, saveChatPassword, clearChatPassword } from "../lib/chat/gate.ts";

test("probeChatProxy maps statuses to modes", async () => {
  const mk = (status) => async () => new Response(null, { status });
  assert.equal(await probeChatProxy(mk(401)), "password-mode");
  assert.equal(await probeChatProxy(mk(204)), "password-mode");
  assert.equal(await probeChatProxy(mk(503)), "byo-mode"); // proxy exists but unconfigured → fall back
  assert.equal(await probeChatProxy(mk(404)), "byo-mode"); // Render / no server
  assert.equal(await probeChatProxy(async () => { throw new Error("net"); }), "byo-mode");
});

test("verifyChatPassword true only on 204", async () => {
  let sent;
  const ok = await verifyChatPassword("pw", async (url, init) => {
    sent = init.headers["x-foray-password"];
    return new Response(null, { status: 204 });
  });
  assert.equal(ok, true);
  assert.equal(sent, "pw");
  assert.equal(await verifyChatPassword("pw", async () => new Response(null, { status: 401 })), false);
  assert.equal(await verifyChatPassword("pw", async () => { throw new Error("net"); }), false);
});

test("password persistence is localStorage-guarded", () => {
  assert.equal(loadChatPassword(), null); // no localStorage in node
  const backing = new Map();
  globalThis.localStorage = {
    getItem: (k) => (backing.has(k) ? backing.get(k) : null),
    setItem: (k, v) => backing.set(k, String(v)),
    removeItem: (k) => backing.delete(k),
  };
  try {
    saveChatPassword("hunter2");
    assert.equal(loadChatPassword(), "hunter2");
    clearChatPassword();
    assert.equal(loadChatPassword(), null);
  } finally {
    delete globalThis.localStorage;
  }
});
```

- [ ] **Step 2:** Run chat test file → new tests FAIL. **Step 3: Implement** `lib/chat/gate.ts`:

```ts
/** Chat gate probing + password persistence. Pure module (no React, no SDK)
 *  so node tests can import it. The Foray server (server/index.ts) answers
 *  /api/chat/auth/check; on Render there is no server and the probe 404s. */

export type ChatProxyMode = "password-mode" | "byo-mode";

const PW_KEY = "foray.chat.password.v1";
const CHECK_PATH = "/api/chat/auth/check";

export async function probeChatProxy(fetchImpl: typeof fetch = fetch): Promise<ChatProxyMode> {
  try {
    const res = await fetchImpl(CHECK_PATH, { method: "GET" });
    // 401/204 = a gate is present. 503 = server exists but chat unconfigured;
    // 404 = static hosting (Render). Both fall back to bring-your-own-key.
    return res.status === 401 || res.status === 204 ? "password-mode" : "byo-mode";
  } catch {
    return "byo-mode";
  }
}

export async function verifyChatPassword(
  password: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  try {
    const res = await fetchImpl(CHECK_PATH, { headers: { "x-foray-password": password } });
    return res.status === 204;
  } catch {
    return false;
  }
}

export function loadChatPassword(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(PW_KEY);
  } catch {
    return null;
  }
}

export function saveChatPassword(password: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PW_KEY, password);
  } catch {}
}

export function clearChatPassword(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(PW_KEY);
  } catch {}
}
```

- [ ] **Step 4:** Run → PASS. **Step 5:** Commit: `git add lib/chat/gate.ts scripts/chat.test.mjs && git commit -m "feat(chat): proxy probe + password persistence"`

---

### Task 7: Agent auth union — `lib/chat/agent.ts`

**Files:** Modify: `lib/chat/agent.ts` (client construction + `runChatTurn` signature)

- [ ] **Step 1:** Add the union + client factory near the top (after imports), and change `runChatTurn`'s option from `apiKey: string` to `auth: ChatAuth`, constructing the client via the factory. Exact changes:

```ts
export type ChatAuth =
  | { kind: "byo"; apiKey: string }
  | { kind: "password"; password: string };

/** BYO mode talks to Anthropic directly (key stays in this browser).
 *  Password mode talks to the Foray server's proxy, which injects the
 *  server-held key; the placeholder apiKey below never reaches Anthropic
 *  (the proxy strips it). */
function makeClient(auth: ChatAuth): Anthropic {
  if (auth.kind === "byo") {
    return new Anthropic({ apiKey: auth.apiKey, dangerouslyAllowBrowser: true });
  }
  return new Anthropic({
    apiKey: "proxied",
    baseURL: `${window.location.origin}/api/chat/proxy`,
    defaultHeaders: { "x-foray-password": auth.password },
    dangerouslyAllowBrowser: true,
  });
}
```

In `runChatTurn(opts)`: replace `apiKey: string;` with `auth: ChatAuth;` in the options interface, and `const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });` with `const client = makeClient(opts.auth);` (adjust the destructuring accordingly). Nothing else changes — loop, tools, cards, abort identical.

- [ ] **Step 2:** `npx tsc --noEmit` → expect ONE error in `components/chat/chat-panel.tsx` (still passes `apiKey`) — that's Task 8's job; if there are errors in `lib/chat/agent.ts` itself, fix them.
- [ ] **Step 3:** Do NOT commit yet (repo would be red) — Task 8 commits both files together.

---

### Task 8: Panel gate screen — `components/chat/chat-panel.tsx`

**Files:** Modify: `components/chat/chat-panel.tsx`; Commit together with `lib/chat/agent.ts` from Task 7.

- [ ] **Step 1:** Wire the modes. Additions (adapt names to the existing file — read it first):

New imports:

```ts
import { runChatTurn, MAX_TOOL_TURNS, type ChatAuth } from "@/lib/chat/agent.ts";
import {
  probeChatProxy,
  verifyChatPassword,
  loadChatPassword,
  saveChatPassword,
  clearChatPassword,
} from "@/lib/chat/gate.ts";
```

New state + probe effect:

```ts
type GateState =
  | { mode: "probing" }
  | { mode: "password-locked"; error: string | null }
  | { mode: "password-ready"; password: string }
  | { mode: "byo" };

const [gate, setGate] = useState<GateState>({ mode: "probing" });
const [pwInput, setPwInput] = useState("");

useEffect(() => {
  let cancelled = false;
  (async () => {
    const proxyMode = await probeChatProxy();
    if (cancelled) return;
    if (proxyMode === "byo-mode") {
      setGate({ mode: "byo" });
      return;
    }
    const saved = loadChatPassword();
    if (saved && (await verifyChatPassword(saved))) {
      if (!cancelled) setGate({ mode: "password-ready", password: saved });
    } else {
      clearChatPassword();
      if (!cancelled) setGate({ mode: "password-locked", error: null });
    }
  })();
  return () => {
    cancelled = true;
  };
}, []);

async function unlock(pw: string) {
  const trimmed = pw.trim();
  if (!trimmed) return;
  if (await verifyChatPassword(trimmed)) {
    saveChatPassword(trimmed);
    setGate({ mode: "password-ready", password: trimmed });
    setPwInput("");
  } else {
    setGate({ mode: "password-locked", error: "Wrong password (or rate-limited — wait a minute)." });
  }
}
```

Auth selection in `send()` — replace the `if (!trimmed || sending || !apiKey) return;` guard and the `apiKey` passed to `runChatTurn`:

```ts
const auth: ChatAuth | null =
  gate.mode === "password-ready"
    ? { kind: "password", password: gate.password }
    : hasKey && apiKey
      ? { kind: "byo", apiKey }
      : null;
if (!trimmed || sending || !auth) return;
// ...
const result = await runChatTurn({ auth, /* rest unchanged */ });
```

401 handling in the catch block — replace the existing 401 branch:

```ts
if (anyErr.status === 401) {
  if (gate.mode === "password-ready") {
    clearChatPassword();
    setGate({ mode: "password-locked", error: "Chat password no longer valid — enter it again." });
  } else {
    setError("Your API key was rejected — check it in Settings.");
    setKeyDialogOpen(true);
  }
}
```

Render gating — before the existing `if (!hasKey)` block:

```tsx
if (gate.mode === "probing") return null;
if (gate.mode === "password-locked") {
  return (
    <div className="p-6 text-center">
      <p className="mb-3 text-sm">This chat runs on the house API key — enter the chat password.</p>
      <form
        className="mx-auto flex max-w-xs gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          unlock(pwInput);
        }}
      >
        <input
          type="password"
          className="min-w-0 flex-1 rounded border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "transparent" }}
          value={pwInput}
          onChange={(e) => setPwInput(e.target.value)}
          aria-label="Chat password"
          maxLength={200}
        />
        <button type="submit" className="rounded border px-4 text-sm" style={{ borderColor: "var(--line)" }}>
          Unlock
        </button>
      </form>
      {gate.error && <p className="mt-2 text-sm text-red-700">{gate.error}</p>}
      <button className="mt-4 text-xs underline" onClick={() => setGate({ mode: "byo" })}>
        Use your own API key instead
      </button>
    </div>
  );
}
```

The existing `if (!hasKey)` no-key CTA now applies only when `gate.mode === "byo"` (it already follows the early returns above, so no structural change beyond ordering). Add a small "Lock" button next to New chat/History when `gate.mode === "password-ready"`:

```tsx
{gate.mode === "password-ready" && (
  <button
    className="underline"
    onClick={() => {
      clearChatPassword();
      setGate({ mode: "password-locked", error: null });
    }}
    disabled={sending}
  >
    Lock
  </button>
)}
```

- [ ] **Step 2:** `npx tsc --noEmit` → clean. `npm test` → all pass (no component tests; the suites guard the libs).
- [ ] **Step 3:** Commit both: `git add lib/chat/agent.ts components/chat/chat-panel.tsx && git commit -m "feat(chat): password-gate mode — proxy auth, unlock screen, 401 re-lock"`

---

### Task 9: Ops — supervisor script, launchd plist, deploy doc, npm script

**Files:**
- Create: `scripts/foray-server.sh` (chmod +x), `deploy/com.foray.server.plist`, `docs/deploy-mac-mini.md`
- Modify: `package.json` (add `"server": "node --experimental-strip-types server/index.ts"` to scripts)

- [ ] **Step 1:** `scripts/foray-server.sh` — adapt Keeper's supervisor (read `~/projects/fishing-law/scripts/keeper-tmux.sh` for the full shape and keep its structure/comments):

```bash
#!/usr/bin/env bash
# Start (or reuse) a detached tmux session running the Foray server.
#
# Launched by launchd at login (see docs/deploy-mac-mini.md): tmux daemonizes and
# this script exits immediately, so the launchd job uses RunAtLoad +
# AbandonProcessGroup — NOT KeepAlive. Crash-restarts happen in the --serve loop
# inside the tmux pane.
#
#   Attach to watch logs:  tmux attach -t foray   (detach: Ctrl-b then d)
#   Stop the server:       tmux kill-session -t foray
#
# Env: PORT (default 4245), FORAY_TMUX_SESSION (default "foray").
# Secrets (ANTHROPIC_API_KEY, FORAY_CHAT_PASSWORD) live in ~/.config/foray/env
# (chmod 600), sourced inside the pane.
set -euo pipefail

SESSION="${FORAY_TMUX_SESSION:-foray}"
PORT="${PORT:-4245}"
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if [[ "${1:-}" == "--serve" ]]; then
  cd "$DIR"
  ENV_FILE="$HOME/.config/foray/env"
  set -a
  [ -f "$ENV_FILE" ] && . "$ENV_FILE"
  set +a
  while true; do
    PORT="$PORT" node --experimental-strip-types server/index.ts && rc=0 || rc=$?
    echo "[foray] server exited (code $rc) — restarting in 3s (Ctrl-C twice to stop)"
    sleep 3
  done
fi

if ! command -v tmux >/dev/null; then
  echo "foray-server: tmux not found (brew install tmux)" >&2
  exit 1
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "foray-server: session '$SESSION' already running (tmux attach -t $SESSION)"
  exit 0
fi

tmux new-session -d -s "$SESSION" -c "$DIR" \
  "PORT=$PORT FORAY_TMUX_SESSION=$SESSION '$SCRIPT' --serve"

echo "foray-server: started session '$SESSION' serving on port $PORT (tmux attach -t $SESSION)"
```

- [ ] **Step 2:** `deploy/com.foray.server.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.foray.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/REPLACE_ME/foray/scripts/foray-server.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>AbandonProcessGroup</key><true/>
  <key>StandardOutPath</key><string>/Users/REPLACE_ME/foray/logs/launchd.log</string>
  <key>StandardErrorPath</key><string>/Users/REPLACE_ME/foray/logs/launchd.err</string>
</dict>
</plist>
```

- [ ] **Step 3:** `docs/deploy-mac-mini.md` — adapt Keeper's (`~/projects/fishing-law/docs/deploy-mac-mini.md`), with these deltas: no Docker/Postgres section; Node 22.6+ required (`--experimental-strip-types`); install = `git clone … ~/foray && cd ~/foray && corepack enable && pnpm install && pnpm build`; secrets = `mkdir -p ~/.config/foray && cat > ~/.config/foray/env` with `ANTHROPIC_API_KEY=…`, `FORAY_CHAT_PASSWORD=…` then `chmod 600`; launchd = copy `deploy/com.foray.server.plist` to `~/Library/LaunchAgents/` replacing `REPLACE_ME`, `mkdir -p ~/foray/logs`, `launchctl load`; update procedure = `git pull && pnpm install && pnpm build && tmux kill-session -t foray && scripts/foray-server.sh`; access notes = `http://<mini-hostname>:4245` on LAN/Tailscale; recommend an Anthropic workspace spend cap. Write real prose, not an outline.
- [ ] **Step 4:** `chmod +x scripts/foray-server.sh`; `bash -n scripts/foray-server.sh` (syntax check) → clean; `plutil -lint deploy/com.foray.server.plist` → OK.
- [ ] **Step 5:** Commit: `git add scripts/foray-server.sh deploy/com.foray.server.plist docs/deploy-mac-mini.md package.json && git commit -m "feat(ops): mac mini deploy — tmux supervisor, launchd plist, deploy guide"`

---

### Task 10: Verification (end-to-end, no real key needed)

- [ ] **Step 1:** Full gates: `npm test` (expect all suites green — 98 prior + new server/gate tests), `npx tsc --noEmit`, `npm run build` (emits `out/`).
- [ ] **Step 2:** Boot the real server against the real export with dummy secrets:

```bash
FORAY_CHAT_PASSWORD=qa-pass ANTHROPIC_API_KEY=sk-ant-dummy PORT=4245 npm run server &
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4245/            # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4245/chat        # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4245/api/chat/auth/check                                   # 401
curl -s -o /dev/null -w "%{http_code}\n" -H "x-foray-password: wrong" http://localhost:4245/api/chat/auth/check      # 401
curl -s -o /dev/null -w "%{http_code}\n" -H "x-foray-password: qa-pass" http://localhost:4245/api/chat/auth/check    # 204
# Proxy with the right password + dummy key → reaches Anthropic, comes back 401 FROM UPSTREAM
# (proves header injection + passthrough):
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "x-foray-password: qa-pass" -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-5","max_tokens":16,"messages":[{"role":"user","content":"hi"}]}' \
  http://localhost:4245/api/chat/proxy/v1/messages                                                                    # 401 (upstream auth)
```

- [ ] **Step 3:** Browser QA against `http://localhost:4245/chat` (Playwright): password gate renders (probe found the proxy); wrong password → inline error; `qa-pass` unlocks → compose screen; send a message → upstream 401 surfaces as the friendly key/error message (wiring proven end-to-end without spend); "Use your own API key instead" link shows the BYO CTA. Then regression: `npm run dev` (or any static serving without the server) → probe 404 → BYO mode unchanged.
- [ ] **Step 4:** Kill the QA server; report results. Do NOT push.

---

## Self-review notes (already applied)

- **Spec coverage:** routes/gate/limits (Tasks 2–5), header allowlist + streaming passthrough (Task 4), client probe/persistence (Task 6), auth union + baseURL (Task 7 — SDK verified to honor `baseURL` verbatim, appending `/v1/messages`), panel modes + 401 re-lock + BYO fallback (Task 8), ops trio + npm script (Task 9), tests incl. no-key-leakage and Render-mode regression (Tasks 2–6, 10). Deployment-matrix "Render unchanged" requires no task — absence of a proxy is the mechanism.
- **Type consistency:** `ServerConfig` (Task 2) consumed by Tasks 5/10; `Limiter.allow(ip, now?)` matches Task 5's injected fake; `ChatAuth` defined in Task 7, consumed in Task 8; `probeChatProxy`/`verifyChatPassword` signatures match between Tasks 6 and 8.
- Tasks 7+8 share one commit deliberately (signature change would leave the repo red in between).
