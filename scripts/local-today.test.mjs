// Pin the device zone: the bugs these guard against only show when local and UTC dates differ.
process.env.TZ = "America/Los_Angeles";
import test from "node:test";
import assert from "node:assert/strict";
import { localIsoDate, msUntilNextLocalMidnight } from "../lib/fishing/local-date.ts";
import { buildChatContext, buildSystemPrompt } from "../lib/chat/prompt.ts";

// 2026-11-16T03:30Z is 7:30 pm on Sunday 2026-11-15 in Los Angeles.
const EVENING = new Date("2026-11-16T03:30:00Z");

test("chat context date is the device's local date, not UTC", () => {
  assert.equal(EVENING.toISOString().slice(0, 10), "2026-11-16"); // what the old code sent
  const ctx = buildChatContext({ regionLabel: "Sierra", locationLabel: "Truckee", lat: 39.3, lon: -120.2 }, EVENING);
  assert.equal(ctx.todayISO, "2026-11-15");
  assert.match(buildSystemPrompt(ctx).dynamicText, /^Today: 2026-11-15$/m);
});

test("msUntilNextLocalMidnight: ordinary evening", () => {
  assert.equal(msUntilNextLocalMidnight(EVENING), 4.5 * 3600_000);
  const next = new Date(EVENING.getTime() + msUntilNextLocalMidnight(EVENING));
  assert.equal(localIsoDate(next), "2026-11-16");
  assert.equal(next.getHours(), 0);
});

test("msUntilNextLocalMidnight: 25-hour day at the DST fall-back (2026-11-01)", () => {
  const justAfterMidnight = new Date(2026, 10, 1, 0, 0, 0); // local 00:00 PDT
  assert.equal(msUntilNextLocalMidnight(justAfterMidnight), 25 * 3600_000);
});

test("msUntilNextLocalMidnight: 23-hour day at the DST spring-forward (2026-03-08)", () => {
  assert.equal(msUntilNextLocalMidnight(new Date(2026, 2, 8, 0, 0, 0)), 23 * 3600_000);
});

test("msUntilNextLocalMidnight is always positive, even exactly at midnight", () => {
  assert.equal(msUntilNextLocalMidnight(new Date(2026, 10, 16, 0, 0, 0)), 24 * 3600_000);
});
