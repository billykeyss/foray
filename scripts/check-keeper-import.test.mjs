import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FISH_WATERS } from "../lib/fishing/waters-index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const keeperDir = process.env.KEEPER_DIR ?? join(homedir(), "projects/keeper/.claude/worktrees/pure-resolve");
const haveKeeper = existsSync(join(keeperDir, "src/resolve"));
const wDir = join(root, "public/fishing/w");

test("every water has finite lon/lat inside CA/NV bounds", () => {
  assert.ok(FISH_WATERS.length > 700);
  for (const w of FISH_WATERS) {
    assert.ok(Number.isFinite(w.lon) && w.lon >= -125 && w.lon <= -114, `${w.slug} lon ${w.lon}`);
    assert.ok(Number.isFinite(w.lat) && w.lat >= 32 && w.lat <= 42.1, `${w.slug} lat ${w.lat}`);
  }
});

test("slugs in FISH_WATERS are unique", () => {
  const slugs = FISH_WATERS.map((w) => w.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.ok(slugs.includes("twelvemile-creek-california") && slugs.includes("twelvemile-creek-nevada"));
});

test("every water has a dataset file and vice versa", () => {
  const files = readdirSync(wDir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  assert.deepEqual(files, FISH_WATERS.map((w) => w.slug).sort());
});

test("engine files are byte-identical to Keeper's src/resolve", { skip: !haveKeeper }, () => {
  const src = join(keeperDir, "src/resolve");
  const names = readdirSync(src).filter((f) => f.endsWith(".ts"));
  assert.ok(names.length >= 5);
  for (const n of names) {
    assert.ok(readFileSync(join(src, n)).equals(readFileSync(join(root, "lib/fishing/engine", n))), n);
  }
});

test("re-running the import produces no diff", { skip: !haveKeeper }, () => {
  const out = mkdtempSync(join(tmpdir(), "keeper-import-"));
  try {
    execFileSync(process.execPath, ["--experimental-strip-types", join(root, "scripts/import-keeper.mjs"), "--out", out], {
      env: { ...process.env, KEEPER_DIR: keeperDir }, stdio: "pipe",
    });
    const walk = (base, rel = "") => readdirSync(join(base, rel), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(base, join(rel, e.name)) : [join(rel, e.name)]);
    const fresh = walk(out).sort();
    assert.ok(fresh.length > 700);
    for (const rel of fresh) {
      assert.ok(existsSync(join(root, rel)), `missing committed ${rel}`);
      assert.ok(readFileSync(join(out, rel)).equals(readFileSync(join(root, rel))), `differs: ${rel}`);
    }
    // nothing committed that a fresh run would not produce
    const committed = [...walk(root, "public/fishing"), ...walk(root, "lib/fishing/engine")];
    for (const rel of committed) assert.ok(fresh.includes(rel), `stale committed ${rel}`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("pyramid-lake candidates include the authority_territory rule", () => {
  const ds = JSON.parse(readFileSync(join(wDir, "pyramid-lake.json"), "utf8"));
  assert.ok(ds.candidates.length > 0);
  const rule = ds.candidates.find((c) => c.citation === "PLPT Fishing Regulations §20.1");
  assert.ok(rule, "authority_territory rule missing");
  assert.equal(rule.scopeKey, "water");
  assert.equal(rule.authorityName, "Pyramid Lake Paiute Tribe");
  assert.equal(rule.appliesTo, "non_tribal");
  assert.ok(ds.water.states.length > 0 && ds.asOf);
});
