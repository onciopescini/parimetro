// ============================================================
// Copia in public/maplibre/ i file del worker di maplibre-gl.
//
// maplibre-gl 6 e' solo ESM e carica il worker come file separato, cercandolo
// accanto a se' stesso. Turbopack sposta il codice in chunk con altri nomi,
// quel file non c'e' piu' dove viene cercato, il server risponde con la pagina
// 404 e il browser lamenta un MIME "text/html": "Worker failed to load".
// Servendo noi i file e indicando l'URL con setWorkerUrl() (vedi Map3D.tsx)
// il problema sparisce.
//
// Si copiano da node_modules a ogni dev/build (predev, prebuild) invece di
// versionarli: restano sempre allineati alla versione installata.
// ============================================================
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const radice = join(dirname(fileURLToPath(import.meta.url)), "..");
const da = join(radice, "node_modules", "maplibre-gl", "dist");
const a = join(radice, "public", "maplibre");

mkdirSync(a, { recursive: true });
// Il worker importa "./maplibre-gl-shared.mjs": vanno serviti entrambi
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(da, f), join(a, f));
}
console.log("worker di maplibre-gl copiato in public/maplibre/");
