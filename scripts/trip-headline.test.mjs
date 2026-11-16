import test from "node:test";
import assert from "node:assert/strict";
import { tripHeadline } from "../lib/trip-headline.ts";

test("brief cases", () => {
  assert.equal(tripHeadline({ label: "Fair" }, ["open"]), "Good to fish, fair to forage");
  assert.equal(tripHeadline({ label: "Prime" }, []), "Prime for foraging");
  assert.equal(tripHeadline(null, ["closed", "closed"]), "Nearby waters closed today");
});

test("any open water wins the fish clause", () => {
  assert.equal(tripHeadline({ label: "Dry" }, ["closed", "open", "unknown"]), "Good to fish, dry to forage");
  assert.equal(tripHeadline(null, ["unknown", "open"]), "Good to fish");
});

test("forage with fish but none open appends the fish clause", () => {
  assert.equal(tripHeadline({ label: "Prime" }, ["closed", "closed"]), "Prime for foraging · Nearby waters closed today");
  assert.equal(tripHeadline({ label: "Fair" }, ["closed", "catch_and_release"]), "Fair for foraging · Catch & release nearby");
  assert.equal(tripHeadline({ label: "Fair" }, ["unknown", "closed"]), "Fair for foraging · Check fishing rules nearby");
});

test("no forage reading", () => {
  assert.equal(tripHeadline(null, ["catch_and_release", "unknown"]), "Catch & release nearby");
  assert.equal(tripHeadline(null, ["unknown"]), "Check fishing rules nearby");
  assert.equal(tripHeadline(null, []), "Set a location to plan today");
});

test("multi-word spore labels use their first word", () => {
  assert.equal(tripHeadline({ label: "Prime fruiting window" }, []), "Prime for foraging");
  assert.equal(tripHeadline({ label: "Prime fruiting window" }, ["open"]), "Good to fish, prime to forage");
});
