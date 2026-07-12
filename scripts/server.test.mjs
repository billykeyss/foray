import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readConfig } from "../server/config.ts";
import { safeEqual } from "../server/auth.ts";
import { createLimiter } from "../server/rate-limit.ts";
import { proxyMessages, ANTHROPIC_URL } from "../server/proxy.ts";

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
