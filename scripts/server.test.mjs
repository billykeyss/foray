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
