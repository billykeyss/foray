/**
 * Fetch recent Western-US wildfire perimeters from NIFC and emit a slim
 * GeoJSON FeatureCollection for the Foray map overlay.
 *
 * Source: InterAgencyFirePerimeterHistory_All_Years_View (closed fires) +
 *         WFIGS_Interagency_Perimeters_YearToDate (current-year).
 *
 * Filters: FIRE_YEAR ∈ {YEAR-2 ... YEAR}, GIS_ACRES ≥ 500, western US bbox.
 * Output:  public/data/burns.geojson  (4326, geometryPrecision 3 ≈ 100m)
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public/data/burns.geojson");

const HISTORY =
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/InterAgencyFirePerimeterHistory_All_Years_View/FeatureServer/0/query";
const CURRENT =
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Interagency_Perimeters_YearToDate/FeatureServer/0/query";

// Western US bbox: roughly CA / OR / WA / NV / ID / MT / WY / UT / CO / AZ / NM
const BBOX = { xmin: -125, ymin: 31, xmax: -103, ymax: 49 };

const NOW_YEAR = new Date().getUTCFullYear();
const YEARS = [NOW_YEAR - 2, NOW_YEAR - 1, NOW_YEAR]; // rolling 3 fire years
const MIN_ACRES = 500;
const PAGE = 1000;

// Douglas-Peucker line simplification (perpendicular-distance, squared).
function sqDist(a, b) {
  const dx = a[0] - b[0],
    dy = a[1] - b[1];
  return dx * dx + dy * dy;
}
function sqSegDist(p, a, b) {
  let x = a[0],
    y = a[1],
    dx = b[0] - x,
    dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  return (p[0] - x) ** 2 + (p[1] - y) ** 2;
}
function dpSimplify(ring, tol2) {
  if (ring.length <= 4) return ring;
  const last = ring.length - 1;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[last] = 1;
  const stack = [[0, last]];
  while (stack.length) {
    const [first, lastIdx] = stack.pop();
    let maxD = 0,
      idx = -1;
    for (let i = first + 1; i < lastIdx; i++) {
      const d = sqSegDist(ring[i], ring[first], ring[lastIdx]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol2 && idx !== -1) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, lastIdx]);
    }
  }
  const out = [];
  for (let i = 0; i < ring.length; i++) if (keep[i]) out.push(ring[i]);
  // ensure closed
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) {
    out.push(out[0]);
  }
  return out.length >= 4 ? out : ring;
}
function simplifyGeom(geom, tol2) {
  if (!geom) return geom;
  if (geom.type === "Polygon") {
    return { ...geom, coordinates: geom.coordinates.map((r) => dpSimplify(r, tol2)) };
  }
  if (geom.type === "MultiPolygon") {
    return {
      ...geom,
      coordinates: geom.coordinates.map((poly) => poly.map((r) => dpSimplify(r, tol2))),
    };
  }
  return geom;
}

// Simplification tolerance in DEGREES. 0.001° ≈ 100m at mid-latitude;
// 0.003° ≈ 300m — good enough to know "is this drainage in the burn"
// while shrinking the bundle by ~10x.
const SIMPLIFY_TOL = 0.003;
const SIMPLIFY_TOL2 = SIMPLIFY_TOL * SIMPLIFY_TOL;

async function fetchAll(url, baseParams) {
  const features = [];
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams({
      ...baseParams,
      f: "geojson",
      outSR: "4326",
      geometryPrecision: "4",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
    });
    const res = await fetch(`${url}?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      console.error(`  HTTP ${res.status} on ${url}`);
      console.error(await res.text().catch(() => ""));
      throw new Error(`HTTP ${res.status}`);
    }
    const j = await res.json();
    const f = j.features ?? [];
    features.push(...f);
    if (f.length < PAGE) break;
    offset += PAGE;
    if (offset > 50_000) {
      console.warn(`  bailing at offset ${offset} (safety cap)`);
      break;
    }
  }
  return features;
}

const FIELD_ALIASES = {
  name: ["INCIDENT", "INCIDENT_NAME", "poly_IncidentName", "incidentName", "FIRE_NAME"],
  year: ["FIRE_YEAR", "fire_year", "FireYear"],
  acres: ["GIS_ACRES", "gis_acres", "poly_GISAcres", "GISAcres"],
  incidentId: ["IRWINID", "irwinId", "poly_IRWINID"],
};

function pick(props, aliases) {
  for (const k of aliases) {
    if (props[k] != null && props[k] !== "") return props[k];
  }
  return null;
}

function normalize(feat) {
  const p = feat.properties || {};
  const acres = Number(pick(p, FIELD_ALIASES.acres));
  if (!Number.isFinite(acres) || acres < MIN_ACRES) return null;

  let year = pick(p, FIELD_ALIASES.year);
  if (!year) {
    // Try to infer year from a current-year feature (WFIGS) — they often
    // expose poly_PolygonDateTime or attr_IncidentSize but no FIRE_YEAR field.
    const d = p.poly_DateCurrent || p.poly_PolygonDateTime || p.attr_FireDiscoveryDateTime;
    if (d) year = new Date(Number(d) || d).getUTCFullYear();
  }
  year = Number(year);
  if (!Number.isInteger(year) || !YEARS.includes(year)) return null;

  return {
    type: "Feature",
    geometry: simplifyGeom(feat.geometry, SIMPLIFY_TOL2),
    properties: {
      name: String(pick(p, FIELD_ALIASES.name) ?? "Unnamed fire"),
      year,
      acres: Math.round(acres),
      irwin: pick(p, FIELD_ALIASES.incidentId) || null,
    },
  };
}

async function main() {
  console.log(`Years: ${YEARS.join(", ")}  ·  min acres: ${MIN_ACRES}`);
  const all = [];
  const seen = new Set(); // dedupe by IRWIN id

  // History service: covers all closed years
  console.log("Fetching InterAgencyFirePerimeterHistory…");
  const histYearList = YEARS.map((y) => `'${y}'`).join(",");
  const histFeatures = await fetchAll(HISTORY, {
    where: `FIRE_YEAR IN (${histYearList}) AND GIS_ACRES >= ${MIN_ACRES}`,
    geometry: JSON.stringify(BBOX),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "INCIDENT,FIRE_YEAR,GIS_ACRES,IRWINID",
    returnGeometry: "true",
  });
  console.log(`  ${histFeatures.length} history features`);
  for (const f of histFeatures) {
    const n = normalize(f);
    if (!n) continue;
    const key = n.properties.irwin || `${n.properties.name}|${n.properties.year}|${n.properties.acres}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(n);
  }

  // Current YTD service: catches in-progress current-year fires
  console.log("Fetching WFIGS YearToDate…");
  try {
    const ytdFeatures = await fetchAll(CURRENT, {
      where: `attr_IncidentSize >= ${MIN_ACRES}`,
      geometry: JSON.stringify(BBOX),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "*",
      returnGeometry: "true",
    });
    console.log(`  ${ytdFeatures.length} ytd features`);
    for (const f of ytdFeatures) {
      // YTD service has different prop names; force this year
      const p = f.properties || {};
      const acres = Number(p.attr_IncidentSize ?? p.poly_GISAcres ?? p.GIS_ACRES);
      const name = p.attr_IncidentName ?? p.poly_IncidentName ?? p.IncidentName ?? "Unnamed fire";
      const irwin = p.attr_IrwinID ?? p.poly_IRWINID ?? p.IRWINID ?? null;
      if (!Number.isFinite(acres) || acres < MIN_ACRES) continue;
      const key = irwin || `${name}|${NOW_YEAR}|${Math.round(acres)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({
        type: "Feature",
        geometry: simplifyGeom(f.geometry, SIMPLIFY_TOL2),
        properties: {
          name: String(name),
          year: NOW_YEAR,
          acres: Math.round(acres),
          irwin,
        },
      });
    }
  } catch (e) {
    console.warn(`  YTD fetch failed (continuing): ${e.message}`);
  }

  console.log(`Total kept: ${all.length} fires`);
  const fc = { type: "FeatureCollection", features: all };
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(fc));
  const sz = JSON.stringify(fc).length;
  console.log(`Wrote ${OUT} (${(sz / 1024 / 1024).toFixed(2)} MB raw)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
