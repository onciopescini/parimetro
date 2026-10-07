// L'intera risposta, in ordine:
//   1. Jev sceglie la domanda tra opzioni chiuse e il codice legge comuni, regione e anno dal testo; se Jev non c'e'
//      o dubita, un modello traduce la domanda in un Intento (puo' sbagliare: si valida sempre)
//   2. il motore calcola il risultato dai JSON del sito   (qui nascono i numeri)
//   3. il modello lo racconta con segnaposto              (puo' sbagliare: si valida)
// Se il passo 3 non e' affidabile si usa il riassunto scritto dal codice.
import { URL_DATI } from "../dati";
import { FASCE, fasciaDaDomanda, normalizzaFascia } from "./fasce";
import { estraiJson, MAX_DOMANDA, promptIntento, validaIntento } from "./intento";
import { chiediModello, type OpzioniLlm } from "./llm";
import type { OpzioniJev } from "./jev";
import { intentoConJev, preparaRiferimenti } from "./intentoJev";
import type { VoceIndice } from "../dati";
import { eseguiIntento } from "./motore";
import { promptNarrazione, validaNarrazione } from "./narrazione";
import type { Contesto, Intento, Leggi, Risultato } from "./tipi";

export interface RispostaChat {
  testo: string;
  risultato: Risultato;
  /** true se il testo e' quello scritto dal modello e controllato; false se e' il riassunto del codice */
  narrato: boolean;
  intento?: Intento;
  /** Chi ha capito la domanda: Jev (scelta tra opzioni chiuse) o il modello di ripiego */
  via?: "jev" | "modello";
}

export async function rispondi(
  domanda: string,
  contesto: Contesto | undefined,
  leggi: Leggi,
  llm: Omit<OpzioniLlm, "json" | "maxToken">,
  jev?: OpzioniJev,
): Promise<RispostaChat | { errore: string }> {
  const d = domanda.trim().slice(0, MAX_DOMANDA);
  if (d.length < 2) return { errore: "Scrivi una domanda." };

  const anni = (await leggi(`${URL_DATI}/anni.json`)) as number[];

  // 1 · domanda -> intento
  let scelto: { valore: Intento } | null = null;
  let via: "jev" | "modello" = "modello";
  let dettaglioJev: "dubbio" | "incompleto" | "senza_risposta" | null = null;
  if (jev) {
    const indice = (await leggi(`${URL_DATI}/indice.json`)) as VoceIndice[];
    const e = await intentoConJev(d, contesto, preparaRiferimenti(indice, anni), jev);
    if (e.ok) {
      scelto = { valore: e.intento };
      via = "jev";
    } else {
      dettaglioJev = e.motivo;
    }
  }
  if (!scelto && llm.modelli.length) {
    scelto = await chiediModello(
      [
        { role: "system", content: promptIntento(contesto, anni) },
        { role: "user", content: d },
      ],
      { ...llm, json: true, maxToken: 250 },
      (testo) => {
        const v = validaIntento(estraiJson(testo));
        return v.ok ? v.intento : null;
      },
    );
  }
  if (!scelto) {
    if (dettaglioJev === "incompleto") {
      return { errore: "Per rispondere mi serve il nome del comune (o apri prima la sua scheda sulla mappa), oppure dimmi quale misura vuoi in classifica." };
    }
    if (dettaglioJev === "dubbio") {
      return { errore: "Non sono sicuro di aver capito la domanda. Prova a riformularla, per esempio: «Quanto spende Roma per i rifiuti?» o «I 10 comuni piccoli con più autonomia finanziaria»." };
    }
    return { errore: "Non sono riuscito a capire la domanda in questo momento. Riprova tra poco o riformulala." };
  }
  // 2 · intento -> risultato (il codice, non il modello)
  let intento = scelto.valore;
  // La fascia detta a parole la legge il codice: il modello a volte la omette o ne inventa una
  const dettaFascia = intento.tipo === "classifica" ? fasciaDaDomanda(d) : null;
  if (intento.tipo === "classifica" && dettaFascia?.fascia && !normalizzaFascia(intento.fascia)) {
    intento = { ...intento, fascia: dettaFascia.fascia };
  }
  const risultato = await eseguiIntento(intento, leggi, contesto);
  if (
    risultato.ok && dettaFascia?.senzaFascia && !(intento.tipo === "classifica" && normalizzaFascia(intento.fascia)) &&
    !risultato.note.some((n) => n.startsWith("Non ho una fascia"))
  ) {
    risultato.note.push(`Non esiste una fascia «${dettaFascia.senzaFascia}»: ho considerato tutti i comuni. Le fasce sono: ${FASCE.join("; ")}.`);
  }

  // Niente da raccontare: errore, ambiguita', fuori ambito -> testo del codice
  if (!risultato.ok) {
    return { testo: risultato.riassunto, risultato, narrato: false, intento: scelto.valore, via };
  }

  // 3 · risultato -> parole, con controllo
  const { system, user } = promptNarrazione(risultato);
  const base = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
  // La narrazione e' facoltativa (c'e' il riassunto del codice): senza modelli si usa il riassunto
  if (!llm.modelli.length) {
    return { testo: risultato.riassunto, risultato, narrato: false, intento: scelto.valore, via };
  }
  // Un giro, pochi modelli, poca attesa
  const opzioni = { ...llm, giri: 1, timeoutMs: 9000, maxToken: 350 };
  const accetta = (testo: string) => {
    const v = validaNarrazione(testo, risultato.fatti, anni);
    return v.ok ? v.testo : null;
  };
  let narrato = await chiediModello(base, { ...opzioni, modelli: llm.modelli.slice(0, 3) }, accetta);
  if (!narrato) {
    // Il modello a pagamento sbaglia di rado e costa pochissimo: un secondo tentativo, col promemoria
    narrato = await chiediModello(
      [...base, { role: "user", content: "Riscrivi senza alcuna cifra: ogni valore va scritto solo come segnaposto [[chiave]], con le chiavi dell'elenco." }],
      { ...opzioni, modelli: llm.modelli.slice(0, 1) },
      accetta,
    );
  }
  return {
    testo: narrato ? narrato.valore : risultato.riassunto,
    risultato,
    narrato: !!narrato,
    intento: scelto.valore,
    via,
  };
}
