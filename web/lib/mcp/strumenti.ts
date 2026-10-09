// Gli strumenti del server MCP: ciascuno corrisponde a un tipo di intento del motore della chat.
// Qui non c'e' nessun modello: gli argomenti vengono controllati e il calcolo lo fa il motore,
// sugli stessi file del sito. Le notizie non sono esposte: sono titoli di terzi, e un titolo
// potrebbe contenere istruzioni rivolte all'assistente.
import { AREE } from "../categorie";
import { FASCE, normalizzaFascia } from "../chat/fasce";
import { METRICHE, METRICHE_STORICO, type Intento, type RifComune } from "../chat/tipi";

/** Errore sugli argomenti: il messaggio e' in italiano e puo' essere mostrato all'assistente */
export class ArgomentoNonValido extends Error {}

type Argomenti = Record<string, unknown>;

export interface Strumento {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Traduce gli argomenti in un intento; lancia ArgomentoNonValido se non vanno bene */
  costruisci: (argomenti: Argomenti) => Intento;
}

const stringa = (a: Argomenti, nome: string, obbligatorio = true, max = 80): string | undefined => {
  const v = a[nome];
  if (v === undefined || v === null || v === "") {
    if (obbligatorio) throw new ArgomentoNonValido(`Manca il campo "${nome}".`);
    return undefined;
  }
  if (typeof v !== "string" || v.trim() === "" || v.length > max) {
    throw new ArgomentoNonValido(`Il campo "${nome}" deve essere un testo di al più ${max} caratteri.`);
  }
  return v.trim();
};

const anno = (a: Argomenti): number | undefined => {
  const v = a.anno;
  if (v === undefined || v === null) return undefined;
  if (!Number.isInteger(v) || (v as number) < 2000 || (v as number) > 2100) {
    throw new ArgomentoNonValido('Il campo "anno" deve essere un anno intero, per esempio 2024.');
  }
  return v as number;
};

const enumerato = <T extends string>(a: Argomenti, nome: string, valori: readonly T[]): T => {
  const v = stringa(a, nome);
  if (!v || !(valori as readonly string[]).includes(v)) {
    throw new ArgomentoNonValido(`Il campo "${nome}" deve essere uno di: ${valori.join(", ")}.`);
  }
  return v as T;
};

const rifComune = (a: Argomenti): RifComune => ({
  comune: stringa(a, "comune")!,
  provincia: stringa(a, "provincia", false, 60),
});

const SCHEMA_COMUNE = {
  comune: { type: "string", description: "Nome del comune, oppure il codice ISTAT a 6 cifre. Esempio: \"Roma\" o \"058091\"." },
  provincia: { type: "string", description: "Facoltativa: serve solo se il nome e' condiviso da piu' comuni." },
};

const schema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const ANNO_SCHEMA = { anno: { type: "integer", description: "Facoltativo: anno del bilancio. Se manca, l'ultimo disponibile." } };

export const STRUMENTI: Strumento[] = [
  {
    name: "scheda_comune",
    description:
      "Scheda di un comune: spesa e entrate pro capite, autonomia finanziaria, rango nella sua fascia demografica, confronto con i comuni simili. Dati di cassa (SIOPE).",
    inputSchema: schema({ ...SCHEMA_COMUNE, ...ANNO_SCHEMA }, ["comune"]),
    costruisci: (a) => ({ tipo: "scheda_comune", ...rifComune(a), anno: anno(a) }),
  },
  {
    name: "confronta_comuni",
    description: "Confronto tra da due a quattro comuni: spesa, entrate, autonomia e rango.",
    inputSchema: schema(
      {
        comuni: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: schema(SCHEMA_COMUNE, ["comune"]),
        },
        ...ANNO_SCHEMA,
      },
      ["comuni"],
    ),
    costruisci: (a) => {
      const lista = a.comuni;
      if (!Array.isArray(lista) || lista.length < 2 || lista.length > 4) {
        throw new ArgomentoNonValido('Il campo "comuni" deve contenere da due a quattro comuni.');
      }
      return {
        tipo: "confronta_comuni",
        comuni: lista.map((c) => rifComune((c ?? {}) as Argomenti)),
        anno: anno(a),
      };
    },
  },
  {
    name: "classifica",
    description:
      "Classifica dei comuni per una metrica (spesa o entrate pro capite, autonomia, rango, reddito medio, PNRR, opere), con filtri per fascia demografica e regione.",
    inputSchema: schema(
      {
        metrica: { type: "string", enum: [...METRICHE], description: "Metrica da ordinare." },
        ordine: { type: "string", enum: ["alto", "basso"], description: "\"alto\" per i valori più alti, \"basso\" per i più bassi." },
        fascia: { type: "string", enum: [...FASCE], description: "Facoltativa: fascia di popolazione." },
        regione: { type: "string", description: "Facoltativa: regione, per esempio \"Campania\"." },
        senza_concentrate: { type: "boolean", description: "Se vero, esclude i comuni con spesa concentrata in una sola voce." },
        ...ANNO_SCHEMA,
      },
      ["metrica", "ordine"],
    ),
    costruisci: (a) => {
      const fasciaTesto = stringa(a, "fascia", false, 40);
      let fascia: string | undefined;
      if (fasciaTesto !== undefined) {
        const n = normalizzaFascia(fasciaTesto);
        if (!n) throw new ArgomentoNonValido(`Fascia non riconosciuta. Valori: ${FASCE.join("; ")}.`);
        fascia = n;
      }
      return {
        tipo: "classifica",
        metrica: enumerato(a, "metrica", METRICHE),
        ordine: enumerato(a, "ordine", ["alto", "basso"] as const),
        fascia,
        regione: stringa(a, "regione", false, 40),
        senza_concentrate: a.senza_concentrate === true,
        anno: anno(a),
      };
    },
  },
  {
    name: "spesa_area",
    description:
      "Quanto spende un comune in un'area (per esempio rifiuti, strade e trasporti, istruzione, sociale), con il confronto con i comuni simili.",
    inputSchema: schema(
      {
        ...SCHEMA_COMUNE,
        area: { type: "string", enum: Object.keys(AREE), description: "Area di spesa." },
      },
      ["comune", "area"],
    ),
    costruisci: (a) => ({
      tipo: "spesa_area",
      ...rifComune(a),
      area: enumerato(a, "area", Object.keys(AREE)),
    }),
  },
  {
    name: "storico_comune",
    description: "Andamento negli anni di una metrica per un comune.",
    inputSchema: schema(
      {
        ...SCHEMA_COMUNE,
        metrica: { type: "string", enum: [...METRICHE_STORICO], description: "Metrica da seguire negli anni." },
      },
      ["comune", "metrica"],
    ),
    costruisci: (a) => ({
      tipo: "storico_comune",
      ...rifComune(a),
      metrica: enumerato(a, "metrica", METRICHE_STORICO),
    }),
  },
  {
    name: "investimenti_comune",
    description: "Opere pubbliche e progetti PNRR o di coesione di un comune (fonte OpenCoesione e Italia Domani).",
    inputSchema: schema(SCHEMA_COMUNE, ["comune"]),
    costruisci: (a) => ({ tipo: "investimenti_comune", ...rifComune(a) }),
  },
  {
    name: "appalti_comune",
    description:
      "Appalti banditi da un comune (fonte ANAC): numero di lotti, quota di affidamenti diretti, valore, confronto con i comuni simili. Dal 2024 la rilevazione ANAC è cambiata.",
    inputSchema: schema({ ...SCHEMA_COMUNE, ...ANNO_SCHEMA }, ["comune"]),
    costruisci: (a) => ({ tipo: "appalti_comune", ...rifComune(a), anno: anno(a) }),
  },
];
