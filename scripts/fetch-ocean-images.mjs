/**
 * Coastal-species version of scripts/fetch-plant-images.mjs. Fetches
 * license-clean photos from Wikimedia Commons + iNaturalist for every
 * harvestable ocean species (skips the microscopic `hazard` warning entries)
 * and writes lib/ocean-gallery.ts (OCEAN_GALLERY). Supports ONLY=id1,id2.
 *
 *   node --experimental-strip-types scripts/fetch-ocean-images.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { licenseAllowed, selectImages } from "./lib/gallery.mjs";
import { HARVESTABLE_OCEAN } from "../lib/ocean-catalog.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const UA = "MushroomRainTracker/1.0 (personal field guide; contact info@gocapsule.ai)";
const CACHE = path.join(ROOT, ".cache/ocean-gallery");
const CAP = 6;
const PER_KIND = 2;
const ALLOWED_INAT = "cc0,cc-by,cc-by-sa,cc-by-nc,cc-by-nc-sa";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url) {
  await mkdir(CACHE, { recursive: true });
  const key = path.join(CACHE, Buffer.from(url).toString("base64url").slice(0, 180) + ".json");
  try { return JSON.parse(await readFile(key, "utf8")); } catch {}
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const json = await res.json();
  await writeFile(key, JSON.stringify(json));
  await sleep(350);
  return json;
}

/** genus + species for API queries; handles "A / B" combined, "(syn. …)", var./ssp. */
function cleanName(sci) {
  return String(sci)
    .replace(/\(.*?\)/g, " ")
    .replace(/\s+(and|&|\/|—|-)\s+.*/i, " ")
    .replace(/\b(var\.|ssp\.|subsp\.|syn\.).*$/i, " ")
    .replace(/\bspp?\.?\b/gi, " ") // drop "sp."/"spp." so genus-only names query the genus
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 2)
    .join(" ");
}

function stripHtml(s) { return String(s).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(); }
function truncate(s, n) { return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…"; }

function cleanDesc(html) {
  let s = String(html);
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<[^>]*>/g, " ");
  s = s.replace(/@media[^{]*\{[\s\S]*?\}/gi, " ");
  s = s.replace(/\{[^}]*\}/g, " ");
  s = s.replace(/[.#]?mw-[\w-]+|body\.skin[\w-]*|\.skin--[\w-]+|\.client-[\w-]+|@media[^,;]*/gi, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (/@media|mw-parser|skin--|client-js|min-width/i.test(s)) return "";
  if (!/[a-z]{4,}/i.test(s) || s.length < 8) return "";
  return s;
}

const JUNK_FILENAME =
  /bucket|market|for[\s_-]?sale|risotto|\bdish\b|distribution|range[\s_-]?map|\bmap\b|stamp|\bcoin\b|\blabel\b|diagram|chart|herbarium|specimen[\s_-]?sheet|logo|drawing|sketch|painting|engrav|lithograph|watercolo|etching|woodcut|haeckel|kunstformen|\bfig(ure)?[\s_.]*\d|\bplate[\s_]*\d|\bpl\.?[\s_]*\d|illustr|1[6-8]\d\d/i;

const OCEAN_KIND_PATTERNS = [
  ["shell", /shell|valve|carapace|\bcrab\b|claw|test\b/i],
  ["detail", /close[\s_-]?up|detail|meat|\broe\b|underside|\bgills?\b|section|dissect/i],
  ["habitat", /habitat|in[\s_-]?situ|tidepool|tide[\s_-]?pool|intertidal|\bbeach\b|\bbed\b|\breef\b|forest|colony|underwater/i],
  ["blade", /blade|frond|thallus|holdfast|stipe/i],
];

function classifyOceanKind(text) {
  const t = (text || "").toLowerCase();
  for (const [kind, re] of OCEAN_KIND_PATTERNS) if (re.test(t)) return kind;
  return "whole";
}

function normalizeCommonsItem(p) {
  const ii = p.imageinfo?.[0];
  if (!ii) return null;
  const title = (p.title ?? "").replace(/^File:/, "");
  if (!/\.(jpe?g|png)$/i.test(title)) return null;
  if (JUNK_FILENAME.test(title)) return null;
  const meta = ii.extmetadata ?? {};
  const license = meta.LicenseShortName?.value ?? meta.License?.value ?? null;
  if (!licenseAllowed(license)) return null;
  const desc = cleanDesc(meta.ImageDescription?.value ?? "");
  return {
    url: ii.url,
    thumb: ii.thumburl ?? null,
    width: ii.width ?? 0, height: ii.height ?? 0,
    thumbWidth: ii.thumbwidth ?? null, thumbHeight: ii.thumbheight ?? null,
    artist: stripHtml(meta.Artist?.value ?? "") || null,
    credit: stripHtml(meta.Credit?.value ?? "") || null,
    license, sourceUrl: ii.descriptionurl ?? null, pageUrl: null,
    kind: classifyOceanKind(`${title} ${desc}`),
    caption: desc ? truncate(desc, 140) : undefined,
    source: "commons",
  };
}

async function fromCommons(scientific) {
  const api = "https://commons.wikimedia.org/w/api.php";
  const imgProps = { prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: "1024" };
  const seen = new Set();
  const out = [];
  const collect = (pages) => {
    for (const p of Object.values(pages ?? {})) {
      const item = normalizeCommonsItem(p);
      if (item && !seen.has(item.url)) { seen.add(item.url); out.push(item); }
    }
  };
  const catQ = new URLSearchParams({
    action: "query", format: "json",
    generator: "categorymembers", gcmtitle: `Category:${scientific}`,
    gcmtype: "file", gcmlimit: "40", ...imgProps,
  });
  try { collect((await getJSON(`${api}?${catQ}`))?.query?.pages); } catch {}
  if (out.length < 4) {
    const sQ = new URLSearchParams({
      action: "query", format: "json",
      generator: "search", gsrsearch: scientific, gsrnamespace: "6", gsrlimit: "25",
      ...imgProps,
    });
    try { collect((await getJSON(`${api}?${sQ}`))?.query?.pages); } catch {}
  }
  return out;
}

async function fromINat(scientific) {
  const taxa = await getJSON(
    `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(scientific)}&per_page=1`,
  ).catch(() => null);
  const taxon = taxa?.results?.[0];
  if (!taxon) return [];
  const obs = await getJSON(
    `https://api.inaturalist.org/v1/observations?taxon_id=${taxon.id}` +
    `&photo_license=${ALLOWED_INAT}&quality_grade=research&per_page=20&order_by=votes&order=desc`,
  ).catch(() => null);
  const out = [];
  for (const o of obs?.results ?? []) {
    for (const ph of o.photos ?? []) {
      if (!licenseAllowed(ph.license_code)) continue;
      const big = (ph.url ?? "").replace("/square.", "/large.");
      out.push({
        url: big, thumb: (ph.url ?? "").replace("/square.", "/medium."),
        width: ph.original_dimensions?.width ?? 0, height: ph.original_dimensions?.height ?? 0,
        thumbWidth: null, thumbHeight: null,
        artist: ph.attribution ? stripHtml(ph.attribution) : null, credit: "iNaturalist",
        license: ph.license_code, sourceUrl: `https://www.inaturalist.org/photos/${ph.id}`,
        pageUrl: `https://www.inaturalist.org/taxa/${taxon.id}`,
        kind: classifyOceanKind(`${o.description ?? ""} ${ph.attribution ?? ""}`),
        caption: undefined, source: "inat",
      });
    }
  }
  return out;
}

async function main() {
  const species = HARVESTABLE_OCEAN.map((o) => ({ id: o.id, scientific: cleanName(o.scientific) }));
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;

  let existing = {};
  try {
    const mod = await import("../lib/ocean-gallery.ts");
    existing = mod.OCEAN_GALLERY ?? {};
  } catch {}

  const gallery = { ...existing };
  for (const { id, scientific } of species) {
    if (only && !only.has(id)) continue;
    const [c, i] = await Promise.all([fromCommons(scientific), fromINat(scientific)]);
    const cands = [...c, ...i].filter((x) => x.url);
    const picked = selectImages(null, cands, { cap: CAP, maxPerKind: PER_KIND })
      .map(({ source, ...keep }) => keep);
    gallery[id] = picked;
    console.log(`${id} (${scientific}): ${picked.length} (commons ${c.length}, inat ${i.length})`);
  }

  const body = Object.entries(gallery)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join("\n");
  const file =
`/**
 * AUTO-GENERATED by scripts/fetch-ocean-images.mjs. Do not edit by hand.
 * Feature-grouped identification photos from Wikimedia Commons + iNaturalist.
 */
import type { OceanDetailImage } from "./ocean-image-types";

export const OCEAN_GALLERY: Record<string, OceanDetailImage[]> = {
${body}
};
`;
  await writeFile(path.join(ROOT, "lib/ocean-gallery.ts"), file);
  console.log(`\nwrote lib/ocean-gallery.ts (${Object.keys(gallery).length} species)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
