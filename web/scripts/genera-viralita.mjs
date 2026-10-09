// ============================================================
// Materiale per gioco, scoperte e confronti: legge i dati gia' pubblicati in public/dati/
// e scrive in public/viralita/ (cartella ignorata da git, come public/dati).
//
//   node scripts/genera-viralita.mjs
//
// Richiede public/dati/ (generato dall'ETL). Non inventa nulla: ogni numero viene dai file del sito.
// Node 24 esegue i .ts direttamente, cosi' usa la stessa logica del sito.
// ============================================================
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { datoComune, domandeGioco, scoperte, slugCoppia, fasciaDi } from "../lib/viralita/genera.ts";

const DATI = join(process.cwd(), "public", "dati");
const USCITA = join(process.cwd(), "public", "viralita");

// I capoluoghi piu' grandi: i confronti tra loro sono quelli che la gente cerca
export const CAPOLUOGHI = [
  "058091", // Roma
  "015146", // Milano
  "063049", // Napoli
  "001272", // Torino
  "082053", // Palermo
  "010025", // Genova
  "037006", // Bologna
  "048017", // Firenze
  "072006", // Bari
  "087015", // Catania
  "027042", // Venezia
  "023091", // Verona
];

const leggiJson = (p) => JSON.parse(readFileSync(p, "utf8"));

export function caricaDati() {
  const indice = leggiJson(join(DATI, "indice.json"));
  return indice.map((v) => {
    const file = join(DATI, "comune", `${v.istat}.json`);
    return datoComune(v, existsSync(file) ? leggiJson(file) : null);
  });
}

function main() {
  mkdirSync(USCITA, { recursive: true });
  const dati = caricaDati();

  const gioco = domandeGioco(dati);
  writeFileSync(join(USCITA, "gioco.json"), JSON.stringify(gioco));

  writeFileSync(join(USCITA, "scoperte.json"), JSON.stringify(scoperte(dati)));

  const per = new Map(dati.map((d) => [d.istat, d]));
  const coppie = [];
  for (let i = 0; i < CAPOLUOGHI.length; i++) {
    for (let j = i + 1; j < CAPOLUOGHI.length; j++) {
      const a = per.get(CAPOLUOGHI[i]);
      const b = per.get(CAPOLUOGHI[j]);
      if (!a || !b) continue;
      coppie.push({ slug: slugCoppia(a, b), a: a.istat, b: b.istat });
    }
  }
  writeFileSync(join(USCITA, "confronti.json"), JSON.stringify(coppie));

  console.log(`gioco: ${gioco.length} domande · scoperte: ${scoperte(dati).length} · confronti: ${coppie.length}`);
  console.log(`fasce usate: ${[...new Set(dati.map((d) => fasciaDi(d.population)))].sort().join(", ")}`);
}

main();
