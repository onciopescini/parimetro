// Il materiale per le tre funzioni di condivisione: il gioco "indovina", le scoperte della settimana
// e i confronti tra capoluoghi. Funzioni pure: ricevono i dati gia' letti dai file del sito e
// restituiscono i contenuti. Nessun numero viene inventato: ogni valore viene dai dati pubblicati.

export interface DatoComune {
  istat: string;
  name: string;
  province: string;
  region: string;
  population: number;
  /** Anno 2024: spesa e pro capite di cassa */
  spesaPc: number | null;
  entrateSpesaPc: number | null;
  autonomia: number | null;
  rango: number | null;
  /** Reddito imponibile medio dei contribuenti IRPEF, ultimo anno */
  reddito: number | null;
  /** Una sola voce supera il 40% della spesa 2024: il pro capite non e' confrontabile */
  concentrata: boolean;
}

export interface GiocoDomanda {
  istat: string;
  nome: string;
  provincia: string;
  abitanti: number;
  /** Valore vero, arrotondato a 10 euro */
  vero: number;
  /** Quattro opzioni, il valore vero incluso */
  opzioni: number[];
}

export interface ScopertaFatto {
  id: string;
  titolo: string;
  testo: string;
  /** Codice ISTAT del comune da aprire, se la scoperta riguarda uno solo */
  istat?: string;
}

/** Dal voce dell'indice e dal file del comune (come lo pubblica l'ETL) al dato che usano le funzioni qui sopra */
export function datoComune(voce: { istat: string; name: string; province: string; region: string; population: number }, d: any): DatoComune {
  const riga = d?.history?.find((r: { year: number }) => r.year === 2024) ?? null;
  const cat = d?.categorie?.["2024"] ?? null;
  return {
    istat: voce.istat,
    name: voce.name,
    province: voce.province,
    region: voce.region,
    population: voce.population,
    spesaPc: riga?.expenditure_pc ?? null,
    entrateSpesaPc: riga?.revenue_pc ?? null,
    autonomia: riga?.autonomia ?? null,
    rango: riga?.fhi ?? null,
    reddito: d?.reddito?.["2024"]?.medio ?? null,
    concentrata: !!cat?.totale && !!cat?.voci?.[0] && cat.voci[0].importo / cat.totale >= 0.4,
  };
}

const arrotonda10 = (x: number) => Math.round(x / 10) * 10;

/** Indice della fascia di popolazione, con le stesse soglie della mappa (0..5) */
export function fasciaDi(abitanti: number): number {
  if (abitanti < 1000) return 0;
  if (abitanti < 5000) return 1;
  if (abitanti < 20000) return 2;
  if (abitanti < 60000) return 3;
  if (abitanti < 250000) return 4;
  return 5;
}

/**
 * Domande del gioco: "Quanto spende X per abitante?". Solo comuni con almeno 10.000 abitanti,
 * cosi' il nome e' riconoscibile. Le tre risposte sbagliate sono valori di comuni della stessa fascia,
 * distanti almeno il 15% dal vero e fra loro: scelte in modo deterministico (vicinanza di popolazione).
 */
export function domandeGioco(dati: DatoComune[]): GiocoDomanda[] {
  const idonei = dati.filter((d) => d.population >= 10000 && d.spesaPc != null && d.spesaPc > 0 && !d.concentrata);
  const domande: GiocoDomanda[] = [];
  for (const c of idonei) {
    const vero = arrotonda10(c.spesaPc!);
    const fascia = fasciaDi(c.population);
    const candidati = idonei
      .filter((o) => o.istat !== c.istat && fasciaDi(o.population) === fascia)
      .sort((a, b) => Math.abs(a.population - c.population) - Math.abs(b.population - c.population));
    const sbagliate: number[] = [];
    for (const o of candidati) {
      const v = arrotonda10(o.spesaPc!);
      const lontano = Math.abs(v - vero) / vero >= 0.15;
      const distinta = sbagliate.every((x) => Math.abs(x - v) / vero >= 0.15);
      if (lontano && distinta) sbagliate.push(v);
      if (sbagliate.length === 3) break;
    }
    if (sbagliate.length < 3) continue;
    domande.push({
      istat: c.istat,
      nome: c.name,
      provincia: c.province,
      abitanti: c.population,
      vero,
      opzioni: [vero, ...sbagliate].sort((a, b) => a - b),
    });
  }
  return domande;
}

// Formattazione a mano (punto per le migliaia, virgola per i decimali): non dipende dal supporto ICU
const migliaia = (x: number) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const euro = (x: number) => `${migliaia(x)} €`;
const eur = euro;
const pct = (x: number) => `${(Math.round(x * 10) / 10).toString().replace(".", ",")}%`;

/** Le scoperte: poche frasi, ciascuna con un dato verificabile e il link al comune. */
export function scoperte(dati: DatoComune[]): ScopertaFatto[] {
  const fatti: ScopertaFatto[] = [];

  const tutti = dati.filter((d) => d.autonomia != null);
  if (tutti.length) {
    const sotto = tutti.filter((d) => d.autonomia! < 50).length;
    fatti.push({
      id: "autonomia-sotto-meta",
      titolo: "Quanti dipendono dagli altri",
      testo: `${migliaia(sotto)} comuni su ${migliaia(tutti.length)} (${pct((100 * sotto) / tutti.length)}) raccolgono meno della metà delle entrate correnti da sé.`,
    });
  }

  const grandi = dati.filter((d) => d.population >= 250000 && d.spesaPc != null && !d.concentrata);
  if (grandi.length) {
    const max = [...grandi].sort((a, b) => b.spesaPc! - a.spesaPc!)[0];
    const min = [...grandi].sort((a, b) => a.spesaPc! - b.spesaPc!)[0];
    fatti.push({
      id: "grandi-spesa",
      titolo: "Le grandi città, a confronto",
      testo: `Tra i comuni con più di 250.000 abitanti, la spesa per abitante nel 2024 va da ${eur(min.spesaPc!)} (${min.name}) a ${eur(max.spesaPc!)} (${max.name}).`,
      istat: max.istat,
    });
  }

  const redditi = dati.filter((d) => d.reddito != null && d.population >= 10000 && !d.concentrata);
  if (redditi.length) {
    const top = [...redditi].sort((a, b) => b.reddito! - a.reddito!)[0];
    fatti.push({
      id: "reddito-massimo",
      titolo: "Il reddito che si dichiara",
      testo: `Tra i comuni con almeno 10.000 abitanti, il reddito imponibile medio più alto è quello di ${top.name} (${top.province}): ${eur(top.reddito!)} per contribuente.`,
      istat: top.istat,
    });
  }

  return fatti;
}

/** Il confronto tra due comuni: tutte le righe che la pagina mostra, gia' formattate */
export function confrontoRighe(a: DatoComune, b: DatoComune) {
  const riga = (etichetta: string, x: number | null, y: number | null, f: (n: number) => string) => ({
    etichetta,
    a: x == null ? "n.d." : f(x),
    b: y == null ? "n.d." : f(y),
  });
  return [
    riga("Abitanti", a.population, b.population, migliaia),
    riga("Spesa per abitante", a.spesaPc, b.spesaPc, eur),
    riga("Entrate per abitante", a.entrateSpesaPc, b.entrateSpesaPc, eur),
    riga("Autonomia finanziaria", a.autonomia, b.autonomia, pct),
    riga("Reddito medio dei contribuenti", a.reddito, b.reddito, eur),
    riga("Rango nella fascia (0-100)", a.rango, b.rango, (n) => String(Math.round(n))),
  ];
}

export const slugCoppia = (a: DatoComune, b: DatoComune) => `${slugSemplice(a.name)}-vs-${slugSemplice(b.name)}`;

const slugSemplice = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
