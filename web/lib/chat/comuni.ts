import { senzaAccenti, type VoceIndice } from "../dati";
import type { RifComune } from "./tipi";

const forma = (s: string) => senzaAccenti(s).replace(/[^a-z0-9]+/g, " ").trim();

export type EsitoComune =
  | { tipo: "trovato"; voce: VoceIndice }
  | { tipo: "ambiguo"; candidati: VoceIndice[] }
  | { tipo: "nessuno" };

/**
 * Da un nome (o codice ISTAT) al comune. Mai a caso: se i comuni possibili sono
 * piu' di uno si chiede, non si sceglie. Il piu' popoloso non e' "quello giusto":
 * San Giovanni e' decine di comuni.
 */
export function risolviComune(
  indice: VoceIndice[],
  rif: RifComune,
  corrente?: { istat?: string },
): EsitoComune {
  const testo = rif.comune.trim();
  if (testo === "@corrente") {
    const v = indice.find((x) => x.istat === corrente?.istat);
    return v ? { tipo: "trovato", voce: v } : { tipo: "nessuno" };
  }
  const t = forma(testo);
  if (!t) return { tipo: "nessuno" };

  if (/^\d{6}$/.test(t)) {
    const v = indice.find((x) => x.istat === t);
    return v ? { tipo: "trovato", voce: v } : { tipo: "nessuno" };
  }

  const prov = rif.provincia ? forma(rif.provincia) : null;
  const filtraProvincia = (voci: VoceIndice[]) =>
    prov ? voci.filter((v) => forma(v.province) === prov || forma(v.province).startsWith(prov)) : voci;

  const esatti = filtraProvincia(indice.filter((v) => forma(v.name) === t));
  if (esatti.length === 1) return { tipo: "trovato", voce: esatti[0] };
  if (esatti.length > 1) return { tipo: "ambiguo", candidati: esatti.slice(0, 6) };

  // Nessun nome identico: inizio del nome ("Reggio" -> Reggio Calabria, Reggio nell'Emilia)
  const inizia = filtraProvincia(indice.filter((v) => forma(v.name).startsWith(t)));
  if (inizia.length === 1) return { tipo: "trovato", voce: inizia[0] };
  if (inizia.length > 1) {
    return { tipo: "ambiguo", candidati: inizia.sort((a, b) => b.population - a.population).slice(0, 6) };
  }
  return { tipo: "nessuno" };
}
