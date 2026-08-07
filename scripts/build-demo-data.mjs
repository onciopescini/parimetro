// ============================================================
// build-demo-data.mjs
// Prepara i dati geografici per l'anteprima locale: scarica i
// confini amministrativi (openpolis/ISTAT) e la popolazione dei
// comuni, semplifica le geometrie e li salva in data/.
//
// I BILANCI NON SONO QUI: vengono generati in modo deterministico
// da lib/demo-budget.ts. Questo script produce solo la geografia,
// che è reale. Quando Supabase è configurato, Map3D punta alla
// Edge Function e tutto questo non viene più usato.
//
//   node scripts/build-demo-data.mjs
// ============================================================

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, ".cache");
const OUT = path.join(ROOT, "data");

const SOURCES = {
  municipalities:
    "https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_municipalities.geojson",
  provinces:
    "https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_provinces.geojson",
  comuni: "https://raw.githubusercontent.com/matteocontrini/comuni-json/master/comuni.json",
};

async function load(name) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${name}.json`);
  if (!fs.existsSync(file)) {
    process.stdout.write(`  scarico ${name}… `);
    const res = await fetch(SOURCES[name]);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log("ok");
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// ---- Semplificazione: arrotonda le coordinate e toglie i punti ripetuti ----
function thinRing(ring, digits) {
  const f = 10 ** digits;
  const out = [];
  for (const [lon, lat] of ring) {
    const p = [Math.round(lon * f) / f, Math.round(lat * f) / f];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  if (out.length > 2) {
    const [a, b] = [out[0], out[out.length - 1]];
    if (a[0] !== b[0] || a[1] !== b[1]) out.push([a[0], a[1]]);
  }
  return out;
}

// Prova a 3 decimali (~100 m); se un anello collassa, ripiega su 4 e poi
// sull'originale, così nessun comune piccolo sparisce dalla mappa.
function simplifyPolygon(poly) {
  for (const digits of [3, 4]) {
    const rings = poly.map((r) => thinRing(r, digits)).filter((r) => r.length >= 4);
    if (rings.length) return rings;
  }
  return poly;
}

function simplifyGeometry(geom) {
  if (geom.type === "Polygon") {
    return { type: "Polygon", coordinates: simplifyPolygon(geom.coordinates) };
  }
  if (geom.type === "MultiPolygon") {
    const polys = geom.coordinates.map(simplifyPolygon).filter((p) => p.length);
    return { type: "MultiPolygon", coordinates: polys.length ? polys : geom.coordinates };
  }
  return geom;
}

function centroid(geom) {
  const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  let best = null;
  for (const poly of polys) {
    const ring = poly[0];
    if (!best || ring.length > best.length) best = ring;
  }
  let lon = 0;
  let lat = 0;
  for (const [x, y] of best) {
    lon += x;
    lat += y;
  }
  return [lon / best.length, lat / best.length];
}

console.log("Preparazione dati geografici…");

const [muni, prov, comuni] = await Promise.all([
  load("municipalities"),
  load("provinces"),
  load("comuni"),
]);

// ISTAT → popolazione reale
const popByIstat = new Map(comuni.map((c) => [c.codice, c.popolazione]));

let missingPop = 0;
const features = muni.features.map((f) => {
  const p = f.properties;
  const istat = p.com_istat_code;
  const population = popByIstat.get(istat);
  if (population == null) missingPop++;
  return {
    type: "Feature",
    geometry: simplifyGeometry(f.geometry),
    properties: {
      istat,
      name: p.name,
      region: p.reg_name,
      province: p.prov_name,
      population: population ?? 1000,
    },
  };
});

// Province: centroide reale + popolazione aggregata dai comuni
const popByProvince = new Map();
for (const f of features) {
  const k = f.properties.province;
  popByProvince.set(k, (popByProvince.get(k) ?? 0) + f.properties.population);
}

const provinces = prov.features.map((f) => {
  const [lon, lat] = centroid(f.geometry);
  return {
    province: f.properties.prov_name,
    region: f.properties.reg_name,
    lon: Math.round(lon * 1e5) / 1e5,
    lat: Math.round(lat * 1e5) / 1e5,
    population: popByProvince.get(f.properties.prov_name) ?? 0,
  };
});

fs.mkdirSync(OUT, { recursive: true });
const geoFile = path.join(OUT, "comuni.geo.json");
const provFile = path.join(OUT, "province.json");
fs.writeFileSync(geoFile, JSON.stringify({ type: "FeatureCollection", features }));
fs.writeFileSync(provFile, JSON.stringify(provinces));

const mb = (f) => (fs.statSync(f).size / 1024 / 1024).toFixed(1);
console.log(`  comuni.geo.json  ${features.length} comuni   ${mb(geoFile)} MB`);
console.log(`  province.json    ${provinces.length} province  ${mb(provFile)} MB`);
if (missingPop) console.log(`  (${missingPop} comuni senza popolazione ISTAT → default 1000)`);
