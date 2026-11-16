import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "out");

// Precache the same-origin app shell: every HTML page, Next static JS/CSS,
// icons, manifest, offline page. Photos live in GCS and are runtime-cached.
const INCLUDE = [
  /\.html$/i,
  /^_next\/static\/.+\.(js|css)$/i,
  /^_next\/static\/media\/.+\.(woff2?|ttf|otf)$/i, // self-hosted fonts (next/font)
  /^icons\/.+\.png$/i,
  /^foray-icon\.png$/i, // in-app logo
  /^manifest\.webmanifest$/i,
  /^fishing\/.+\.json$/i, // offline fishing rules + recent stocking (public/fishing)
];
const EXCLUDE = [/^sw\.js$/i, /\.map$/i, /^img\//i];

async function walk(dir, base = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(path.join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

async function precacheEntries() {
  const files = await walk(OUT);
  const picked = files.filter(
    (f) => INCLUDE.some((re) => re.test(f)) && !EXCLUDE.some((re) => re.test(f)),
  );
  const entries = [];
  let payload = 0;
  for (const rel of picked) {
    const buf = await readFile(path.join(OUT, rel));
    payload += buf.length;
    const revision = createHash("md5").update(buf).digest("hex");
    // URL-encode each path segment so entries for dynamic-route chunks
    // (…/catalog/[id]/page.js) match the browser's encoded request (%5Bid%5D).
    const url = "/" + rel.split("/").map(encodeURIComponent).join("/");
    entries.push({ url, revision });
  }
  entries.sort((a, b) => a.url.localeCompare(b.url));
  return { entries, payload };
}

const { entries, payload } = await precacheEntries();
await build({
  entryPoints: [path.join(ROOT, "sw/index.ts")],
  outfile: path.join(OUT, "sw.js"),
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  define: { __SERWIST_MANIFEST: JSON.stringify(entries) },
});
const bytes = entries.reduce((n, e) => n + e.url.length, 0);
console.log(`SW built: ${entries.length} precache entries (${bytes} url bytes) → out/sw.js`);
console.log(`Precache payload: ${payload} bytes (${(payload / 1024 / 1024).toFixed(2)} MB)`);
