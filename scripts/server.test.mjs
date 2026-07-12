import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readConfig } from "../server/config.ts";
import { safeEqual } from "../server/auth.ts";
import { createLimiter } from "../server/rate-limit.ts";
import { proxyMessages, ANTHROPIC_URL } from "../server/proxy.ts";
import { staticCandidates } from "../server/static.ts";
import { buildApp } from "../server/index.ts";

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
  assert.equal(
    empty.outDir,
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "server", "..", "out")
  );
  assert.equal(readConfig({ PORT: "0" }).port, 0);
  assert.equal(readConfig({ PORT: "garbage" }).port, 4245);
  assert.equal(readConfig({ FORAY_OUT_DIR: "/custom/out" }).outDir, "/custom/out");
});

test("safeEqual is correct on equal/unequal/length-mismatch", () => {
  assert.equal(safeEqual("secret", "secret"), true);
  assert.equal(safeEqual("secret", "secreT"), false);
  assert.equal(safeEqual("secret", "secret-longer"), false);
  assert.equal(safeEqual("", ""), true);
});

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

test("unauthenticated probe does not consume rate-limit budget", async () => {
  let calls = 0;
  const app = fixtureApp({}, { limiter: { allow: () => { calls++; return true; }, reset() {} } });
  await app.request("/api/chat/auth/check"); // no password header
  assert.equal(calls, 0);
  await app.request("/api/chat/auth/check", { headers: { "x-foray-password": "guess" } });
  assert.equal(calls, 1);
});

test("proxy route maps upstream network failure to 502 json", async () => {
  const app = fixtureApp({}, {
    upstreamFetch: async () => { throw new TypeError("fetch failed"); },
    limiter: { allow: () => true, reset() {} },
  });
  const res = await app.request("/api/chat/proxy/v1/messages", {
    method: "POST",
    headers: { "x-foray-password": "pw", "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, "upstream unreachable");
});
