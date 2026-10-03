// L'intera risposta, in ordine:
//   1. il modello traduce la domanda in un Intento        (puo' sbagliare: si valida)
//   2. il motore calcola il risultato dai JSON del sito   (qui nascono i numeri)
//   3. il modello lo racconta con segnaposto              (puo' sbagliare: si valida)
// Se il passo 3 non e' affidabile si usa il riassunto scritto dal codice.
import { URL_DATI } from "../dati";
import { FASCE, fasciaDaDomanda, normalizzaFascia } from "./fasce";
import { estraiJson, MAX_DOMANDA, promptIntento, validaIntento } from "./intento";
import { chiediModello, type OpzioniLlm } from "./llm";
import { eseguiIntento } from "./motore";
import { promptNarrazione, validaNarrazione } from "./narrazione";
import type { Contesto, Intento, Leggi, Risultato } from "./tipi";

export interface RispostaChat {
  testo: string;
  risultato: Risultato;
  /** true se il testo e' quello scritto dal modello e controllato; false se e' il riassunto del codice */
  narrato: boolean;
  intento?: Intento;
}

export async function rispondi(
  domanda: string,
  contesto: Contesto | undefined,
  leggi: Leggi,
  llm: Omit<OpzioniLlm, "json" | "maxToken">,
): Promise<RispostaChat | { errore: string }> {
  const d = domanda.trim().slice(0, MAX_DOMANDA);
  if (d.length < 2) return { errore: "Scrivi una domanda." };

  const anni = (await leggi(`${URL_DATI}/anni.json`)) as number[];

  // 1 · domanda -> intento
  const scelto = await chiediModello(
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
  if (!scelto) {
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
    return { testo: risultato.riassunto, risultato, narrato: false, intento: scelto.valore };
  }

  // 3 · risultato -> parole, con controllo
  const { system, user } = promptNarrazione(risultato);
  const base = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
  // La narrazione e' facoltativa (c'e' il riassunto del codice): un giro, pochi modelli, poca attesa
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
  };
}
