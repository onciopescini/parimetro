// La spiegazione a parole. Il modello vede SOLO i fatti gia' calcolati e puo'
// citarli con [[chiave]]; il codice sostituisce il segnaposto col valore formattato.
// Una cifra scritta a mano dal modello, o una chiave inventata, fa scartare tutto il
// testo: si torna al riassunto deterministico. Cosi' un numero sbagliato non puo'
// arrivare all'utente nemmeno per distrazione del modello.
import type { Fatto, Risultato } from "./tipi";

export function promptNarrazione(r: Risultato): { system: string; user: string } {
  const fatti = Object.entries(r.fatti)
    .map(([k, f]) => `- [[${k}]] → ${f.label.charAt(0).toLowerCase()}${f.label.slice(1)} (valore, solo per capire i confronti: ${f.valore})`)
    .join("\n");
  const note = r.note.length ? `\nAvvertenze da rispettare:\n${r.note.map((n) => `- ${n}`).join("\n")}` : "";
  return {
    system: `Sei l'assistente di Parimetro, un sito sui bilanci dei comuni italiani. Scrivi in italiano, tono sobrio, 2-4 frasi.
REGOLE ASSOLUTE:
- Non scrivere MAI cifre (0-9). Ogni numero, importo, percentuale o anno va citato con il suo segnaposto, ad esempio [[spesa_pc]] oppure [[anno]].
- I segnaposto contengono già l'unità di misura (€, %, mln €): non aggiungerla dopo.
- Il «rango» è un punteggio da 0 a 100 rispetto ai comuni della stessa fascia di popolazione: NON è una posizione in classifica, non chiamarlo «posto» o «posizione».
- Dopo il segnaposto non ripetere la descrizione né il valore: scrivi solo il segnaposto.
- Quando un fatto dice «mediano» o «mediana» scrivi «mediana», mai «media»: sono due cose diverse.
- Scrivi il nome del comune senza articolo davanti: «a Milano», «Campobasso ha», mai «il Milano».
- Se due valori sono uguali, dillo senza articoli davanti ai segnaposto: «in linea con i comuni simili».
- Usa SOLO i segnaposto dell'elenco. Non inventare fatti e non usare conoscenze esterne.
- Descrivi, non giudicare: niente "bene", "male", "sprechi", niente opinioni politiche e niente previsioni.
- I dati sono di cassa (incassi e pagamenti), non di competenza.
- Se ci sono avvertenze, riportane il senso.
- Rispondi solo con il testo, senza elenchi né titoli.`,
    user: `Argomento: ${r.titolo}\nFatti disponibili:\n${fatti}${note}`,
  };
}

export type EsitoNarrazione = { ok: true; testo: string } | { ok: false; motivo: string };

/** Controlla il testo del modello e riempie i segnaposto. */
export function validaNarrazione(
  testo: string,
  fatti: Record<string, Fatto>,
  anniAmmessi: number[] = [],
): EsitoNarrazione {
  const t = testo.trim();
  if (!t) return { ok: false, motivo: "vuoto" };
  if (t.length > 900) return { ok: false, motivo: "troppo lungo" };

  // Ogni segnaposto deve esistere
  const chiavi = [...t.matchAll(/\[\[([a-z0-9_]+)\]\]/g)].map((m) => m[1]);
  const sconosciuta = chiavi.find((k) => !(k in fatti));
  if (sconosciuta) return { ok: false, motivo: `segnaposto inventato: ${sconosciuta}` };

  // Fuori dai segnaposto, nessuna cifra (salvo anni dei dati: "nel 2023")
  const senza = t.replace(/\[\[[a-z0-9_]+\]\]/g, "");
  const cifre = [...senza.matchAll(/\d[\d.,]*/g)].map((m) => m[0]);
  const abusive = cifre.filter((c) => !anniAmmessi.includes(Number(c)));
  if (abusive.length) return { ok: false, motivo: `cifre scritte dal modello: ${abusive.join(" ")}` };

  // Segnaposto non chiuso rimasto nel testo
  if (/\[\[|\]\]/.test(senza)) return { ok: false, motivo: "segnaposto malformato" };

  return { ok: true, testo: ripulisci(t.replace(/\[\[([a-z0-9_]+)\]\]/g, (_, k: string) => fatti[k].valore)) };
}

/**
 * Rifiniture sicure sul testo gia' riempito: i modelli aggiungono spesso l'unita' di misura
 * dopo un segnaposto che la contiene gia' ("2.008 € €", "2.008 € euro"). Si tolgono i
 * doppioni; mai si tocca una cifra.
 */
export function ripulisci(testo: string): string {
  return testo
    .replace(/(€|%)(\s*(?:€|%|euro\b))+/gi, (_, u: string) => u)
    .replace(/(\bnella sua fascia)(?:\s+(?:di popolazione\s+)?nella sua fascia)+/gi, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
