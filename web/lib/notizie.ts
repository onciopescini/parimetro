// Notizie sui conti di un comune: forma di get_notizie_comune() nel file comune/{istat}.json -> "notizie".
// Solo titolo, fonte, data e link: il sito non copia ne' riassume gli articoli.

export interface Notizia {
  titolo: string;
  /** Il sito della testata, senza "www." */
  fonte: string;
  /** AAAA-MM-GG */
  data: string;
  url: string;
}

export interface NotizieComune {
  /** Quando e' stata fatta l'ultima ricerca */
  raccolta_il: string;
  notizie: Notizia[];
}

/** "10 giugno 2026" */
export function dataBreve(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

/** Un link va aperto solo se e' web: i dati arrivano da una ricerca, non si fa fede al loro schema. */
export function linkSicuro(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}
