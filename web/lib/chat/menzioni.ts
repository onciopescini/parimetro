// Cio' che nella domanda si puo' leggere SENZA un modello: quali comuni sono nominati, quale regione, quale anno.
// Un modello che "scrive" il nome di un comune puo' inventarlo; qui si cercano solo nomi che esistono davvero nell'indice.
import { senzaAccenti, type VoceIndice } from "../dati";
import { normalizzaRegione } from "./fasce";
import type { RifComune } from "./tipi";

const forma = (s: string) => senzaAccenti(s).replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Parole di tutti i giorni che sono ANCHE nomi di comuni ("Alto", "Sala", "Grado", "Casa"...). Una parola cosi',
 * scritta in minuscolo o a inizio frase, non e' un comune: serve la maiuscola in mezzo alla frase.
 */
const COMUNI_COMUNI = new Set(
  `alto basso come sono sono spesa spese entrata entrate costo costa dove quale quali quanto quanti quanta cosa casa grado sala
  fonte ponte torre pace gioia sotto sopra oltre meno piu molto poco bene male anno anni dati dato fondi fondo opere opera gare
  gara appalti appalto scuola scuole strade strada rifiuti reddito redditi media medio medie comune comuni citta paese paesi
  regione provincia italia italiano mappa lista elenco classifica primo prima ultimo ultima grande grandi piccolo piccoli
  tutti tutte ogni senza con per tra fra dei delle degli della dello nel nella nei nelle sul sulla negli ancora allora oggi
  poi dopo prima quando mentre perche cosi solo anche altro altra altri altre buono buona migliore migliori peggiore peggiori
  pace gioia riva piano monte colle valle campo prato selva rocca castello pieve borgo villa sorgente lago mare porto
  tempo tanti tanto pochi pochi finanza conti bilancio bilanci tasse tributi imposte debito debiti pagamenti incassi
  stato nuovo nuova vecchio vecchia lungo lunga forte corte dote moto mola cave sala fiume rosa bella`.split(/\s+/),
);

const PRECEDE = new Set("comune di del della dello dei a ad da per in nel nella su sul con tra fra e ed vs contro rispetto confronta".split(" "));

const CORRENTE = /\b(questo comune|questo paese|questa citta|il mio comune|nel mio comune|del mio comune|il nostro comune|qui|nel comune aperto|di questo|in questo comune)\b/;

/** Un comune nominato; `forte` = scritto con la maiuscola, su piu' parole o introdotto da "di", "a", "per"... */
export interface MenzioneComune extends RifComune {
  forte: boolean;
}

export interface Menzioni {
  comuni: MenzioneComune[];
  /** Si parla del comune aperto sul sito ("questo comune", "il mio comune") */
  corrente: boolean;
}

interface Finestra {
  da: number;
  a: number;
  voci: VoceIndice[];
  forte: boolean;
}

/** Costruita una volta per indice: le forme di tutti i nomi, anche quelle prima della barra ("Bolzano/Bozen"). */
export function preparaIndice(indice: VoceIndice[]): Map<string, VoceIndice[]> {
  const m = new Map<string, VoceIndice[]>();
  for (const v of indice) {
    for (const parte of new Set([v.name, ...v.name.split("/")])) {
      const k = forma(parte);
      if (!k) continue;
      const l = m.get(k);
      if (l) l.push(v);
      else m.set(k, [v]);
    }
  }
  return m;
}

/** Quali comuni nomina la domanda: nome (anche di piu' parole), codice ISTAT, con la provincia se la dice. */
export function trovaComuni(domanda: string, forme: Map<string, VoceIndice[]>): Menzioni {
  const originale = domanda.replace(/[^\p{L}\p{N}']+/gu, " ").trim().split(/\s+/).filter(Boolean);
  const parole = originale.map((p) => forma(p));
  const testo = ` ${parole.filter(Boolean).join(" ")} `;
  const corrente = CORRENTE.test(forma(domanda));
  const trovati: Finestra[] = [];
  const usata = new Array(parole.length).fill(false);

  for (let lung = 6; lung >= 1; lung--) {
    for (let i = 0; i + lung <= parole.length; i++) {
      if (usata.slice(i, i + lung).some(Boolean)) continue;
      const chiave = parole.slice(i, i + lung).join(" ");
      const voci = forme.get(chiave);
      if (!voci) continue;
      let forte = lung > 1;
      if (lung === 1) {
        const parola = parole[i];
        if (parola.length < 3) continue;
        const maiuscola = /^\p{Lu}/u.test(originale[i]);
        const iniziale = i === 0;
        const dopoPreposizione = i > 0 && PRECEDE.has(parole[i - 1]);
        if (COMUNI_COMUNI.has(parola) && !(maiuscola && !iniziale)) continue;
        forte = (maiuscola && !iniziale) || dopoPreposizione;
      }
      for (let k = i; k < i + lung; k++) usata[k] = true;
      trovati.push({ da: i, a: i + lung, voci, forte });
    }
  }
  trovati.sort((x, y) => x.da - y.da);

  const comuni: MenzioneComune[] = [];
  const visti = new Set<string>();
  for (const t of trovati) {
    // La provincia detta nella domanda scioglie gli omonimi ("Castro, Lecce", "Castro in provincia di Lecce")
    let voci = t.voci;
    if (voci.length > 1) {
      const conProvincia = voci.filter((v) => testo.includes(` ${forma(v.province)} `) && forma(v.province) !== forma(v.name));
      if (conProvincia.length === 1) voci = conProvincia;
      else if (conProvincia.length > 1) voci = conProvincia;
    }
    const nome = voci[0].name;
    const rif: MenzioneComune = voci.length === 1 ? { comune: voci[0].istat, forte: t.forte } : { comune: nome, forte: t.forte };
    const chiave = voci.length === 1 ? voci[0].istat : forma(nome);
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    comuni.push(rif);
  }
  // I codici ISTAT scritti per esteso
  for (const p of parole) {
    if (/^\d{6}$/.test(p) && !visti.has(p)) {
      visti.add(p);
      comuni.push({ comune: p, forte: true });
    }
  }
  return { comuni, corrente };
}

/** La regione nominata ("in Puglia", "del trentino"), una sola; null se non c'e' o ce ne sono piu' di una. */
export function trovaRegione(domanda: string, regioni: string[]): string | null {
  const t = ` ${forma(domanda)} `;
  const candidati = new Set<string>();
  for (const r of regioni) {
    const piene = [forma(r), ...r.split(/[-/]/).map(forma)].filter((x) => x.length >= 5);
    if (piene.some((p) => t.includes(` ${p} `))) candidati.add(r);
  }
  if (candidati.size === 1) return [...candidati][0];
  // Forme brevi ("emilia", "valle d aosta") che il normalizzatore di tutti i giorni gia' conosce
  const via = normalizzaRegione(
    ["emilia", "friuli", "trentino", "alto adige", "valle d aosta", "aosta"].find((x) => t.includes(` ${x} `)),
    regioni,
  );
  return via;
}

/** L'anno detto a cifre ("nel 2023"), se e' tra quelli disponibili. */
export function trovaAnno(domanda: string, anni: number[]): number | undefined {
  const m = [...domanda.matchAll(/\b(19|20)\d{2}\b/g)].map((x) => Number(x[0])).filter((a) => anni.includes(a));
  return m.length === 1 ? m[0] : undefined;
}
