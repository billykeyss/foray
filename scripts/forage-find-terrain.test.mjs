import test from "node:test";
import assert from "node:assert/strict";
import {
  haversineKm,
  destination,
  bearingDeg,
  compass8,
  lonLatToTilePixel,
  lonLatTo3857,
} from "../lib/forage-find/geo.ts";
import {
  decodeTerrarium,
  terrainAt,
  snapToDrainage,
  terrainKind,
  tilesFor,
  makeSampler,
  loadElevationSampler,
} from "../lib/forage-find/terrain.ts";
import { candidateGrid, pickSpaced } from "../lib/forage-find/grid.ts";
import { pointInGeometry, burnAt, burnInteriorPoints } from "../lib/forage-find/burns.ts";

const TRUCKEE = { lat: 39.328, lon: -120.183 };

test("haversine / destination / bearing round-trip", () => {
  const p = destination(TRUCKEE.lat, TRUCKEE.lon, 45, 10);
  assert.ok(Math.abs(haversineKm(TRUCKEE, p) - 10) < 0.01);
  assert.ok(Math.abs(bearingDeg(TRUCKEE, p) - 45) < 0.5);
  assert.equal(compass8(0), "N");
  assert.equal(compass8(44), "NE");
  assert.equal(compass8(181), "S");
  assert.equal(compass8(350), "N");
  assert.equal(compass8(270), "W");
});

test("web mercator tile pixel + EPSG:3857", () => {
  const t = lonLatToTilePixel(0, 0, 1);
  assert.equal(t.tx, 1);
  assert.equal(t.ty, 1);
  assert.ok(Math.abs(t.px) < 1e-6 && Math.abs(t.py) < 1e-6);
  const [x, y] = lonLatTo3857(-120, 39);
  assert.ok(Math.abs(x - -13358338.9) < 1);
  assert.ok(Math.abs(y - 4721671.6) < 5);
});

test("terrarium decode", () => {
  assert.equal(decodeTerrarium(128, 0, 0), 0);
  assert.equal(decodeTerrarium(135, 208, 128), 135 * 256 + 208 + 0.5 - 32768);
});

// A synthetic DEM: a V-shaped valley running N-S along lon0, rising 0.1 m per metre to the east/west,
// plus a gentle southward tilt. Elevation in metres.
const LON0 = -120.2;
const M_PER_DEG_LON = 111320 * Math.cos((39.3 * Math.PI) / 180);
function valley(lat, lon) {
  const dx = (lon - LON0) * M_PER_DEG_LON;
  return 2000 + Math.abs(dx) * 0.1 + (lat - 39.3) * 111320 * 0.02;
}

test("terrainAt: slope, aspect and TPI on a synthetic valley", () => {
  // On the east wall the ground falls to the west, so it faces west.
  const east = terrainAt(valley, 39.3, LON0 + 2000 / M_PER_DEG_LON);
  assert.ok(east.slopeDeg > 4 && east.slopeDeg < 8, `slope ${east.slopeDeg}`);
  assert.equal(east.aspect, "W");
  // On the valley floor the ring is higher all round: strongly negative TPI → drainage.
  const floor = terrainAt(valley, 39.3, LON0);
  assert.ok(floor.tpiM < -8, `tpi ${floor.tpiM}`);
  assert.equal(terrainKind(floor.tpiM), "drainage");
  assert.equal(terrainKind(12), "ridge");
  assert.equal(terrainKind(0), "slope");
});

test("terrainAt: flat ground has no aspect", () => {
  const t = terrainAt(() => 1500, 39, -120);
  assert.equal(t.aspect, null);
  assert.equal(t.slopeDeg, 0);
});

test("snapToDrainage moves a wall point down to the valley floor within the radius", () => {
  const start = { lat: 39.3, lon: LON0 + 300 / M_PER_DEG_LON };
  const s = snapToDrainage(valley, start.lat, start.lon, 400);
  const dx = Math.abs((s.lon - LON0) * M_PER_DEG_LON);
  assert.ok(dx < 60, `snapped ${dx} m from the thalweg`);
  assert.ok(haversineKm(start, s) <= 0.45);
});

test("tilesFor covers each point's neighbourhood; makeSampler interpolates a decoded tile", async () => {
  const tiles = tilesFor([TRUCKEE], 400, 12);
  assert.ok(tiles.length >= 1 && tiles.length <= 4);
  // One tile of constant elevation 1800 m (terrarium: 1800+32768 = 34568 = 135*256 + 8).
  const px = new Uint8ClampedArray(256 * 256 * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 135;
    px[i + 1] = 8;
    px[i + 2] = 0;
    px[i + 3] = 255;
  }
  const seen = [];
  const sample = await loadElevationSampler([TRUCKEE], 400, async (z, x, y) => {
    seen.push(`${z}/${x}/${y}`);
    return { width: 256, height: 256, data: px };
  });
  assert.equal(seen.length, tiles.length);
  assert.equal(Math.round(sample(TRUCKEE.lat, TRUCKEE.lon)), 1800);
  // Outside the loaded tiles → null.
  assert.equal(sample(45, -100), null);
  const failing = await loadElevationSampler([TRUCKEE], 400, async () => null);
  assert.equal(failing(TRUCKEE.lat, TRUCKEE.lon), null);
  assert.equal(typeof makeSampler, "function");
});

test("candidateGrid: ~target points, all inside the radius, includes the centre", () => {
  const pts = candidateGrid(TRUCKEE.lat, TRUCKEE.lon, 40, 60);
  assert.ok(pts.length >= 45 && pts.length <= 75, `got ${pts.length}`);
  for (const p of pts) assert.ok(haversineKm(TRUCKEE, p) <= 40.01);
  assert.ok(pts.some((p) => haversineKm(TRUCKEE, p) < 0.01));
});

test("pickSpaced keeps the best and enforces minimum spacing", () => {
  const items = [
    { lat: 39.3, lon: -120.2, score: 90 },
    { lat: 39.3001, lon: -120.2, score: 89 }, // ~11 m from the first → dropped
    { lat: 39.4, lon: -120.2, score: 70 },
    { lat: 39.5, lon: -120.2, score: 60 },
  ];
  const out = pickSpaced(items, 2, 2);
  assert.deepEqual(out.map((o) => o.score), [90, 70]);
});

const square = (lon, lat, d) => [
  [
    [lon - d, lat - d],
    [lon + d, lat - d],
    [lon + d, lat + d],
    [lon - d, lat + d],
    [lon - d, lat - d],
  ],
];
const FIRES = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { name: "Old", year: 2019 }, geometry: { type: "Polygon", coordinates: square(-120.1, 39.3, 0.05) } },
    {
      type: "Feature",
      properties: { name: "Caldor", year: 2025 },
      geometry: {
        type: "MultiPolygon",
        coordinates: [[...square(-120.1, 39.3, 0.03), [[-120.11, 39.29], [-120.09, 39.29], [-120.09, 39.31], [-120.11, 39.31], [-120.11, 39.29]].reverse()]],
      },
    },
  ],
};

test("point in polygon honours holes and multipolygons", () => {
  const g = FIRES.features[1].geometry;
  assert.equal(pointInGeometry(-120.08, 39.3, g), true); // outside the ±0.01 hole, inside the ±0.03 ring
  assert.equal(pointInGeometry(-120.075, 39.3, g), true);
  assert.equal(pointInGeometry(-120.1, 39.3, g), false); // in the hole
  assert.equal(pointInGeometry(-121, 39.3, g), false);
});

test("burnAt returns the most recent fire covering the point with its age", () => {
  const b = burnAt(39.3, -120.075, FIRES, 2026);
  assert.deepEqual(b, { name: "Caldor", year: 2025, ageYears: 1 });
  const old = burnAt(39.3, -120.1, FIRES, 2026); // in Caldor's hole, inside Old
  assert.equal(old.name, "Old");
  assert.equal(burnAt(40, -119, FIRES, 2026), null);
});

test("burnInteriorPoints samples recent burns near the centre only", () => {
  const pts = burnInteriorPoints(FIRES, 39.3, -120.1, 40, 2026, 3, 10);
  assert.ok(pts.length > 0);
  for (const p of pts) {
    const b = burnAt(p.lat, p.lon, FIRES, 2026);
    assert.ok(b && b.name === "Caldor", "only the recent fire is sampled");
  }
  assert.equal(burnInteriorPoints(FIRES, 45, -100, 40, 2026, 3, 10).length, 0);
});
