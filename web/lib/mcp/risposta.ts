// Il testo che l'assistente riceve: lo compone il codice, mai un modello.
// Ogni risposta chiude con la fonte e il link alla scheda sulla mappa, come vuole il progetto.
import type { Risultato } from "../chat/tipi";

const SITO = "https://parimetro.it";
const MAX_RIGHE = 30;

export function testoRisultato(r: Risultato): string {
  const parti: string[] = [r.titolo];
  if (r.riassunto) parti.push("", r.riassunto);

  if (r.candidati?.length) {
    parti.push("", "Più comuni hanno questo nome. Indica la provincia:");
    for (const c of r.candidati) parti.push(`- ${c.nome} (${c.provincia}, codice ISTAT ${c.istat})`);
  }

  if (r.righe.length) {
    parti.push("", r.colonne.map((c) => c.label).join(" | "));
    for (const riga of r.righe.slice(0, MAX_RIGHE)) {
      parti.push(r.colonne.map((c) => riga[c.k] ?? "").join(" | "));
    }
    if (r.righe.length > MAX_RIGHE) {
      parti.push(`… altre ${r.righe.length - MAX_RIGHE} righe: ${SITO}`);
    }
  }

  if (r.note.length) parti.push("", "Avvertenze:", ...r.note.map((n) => `- ${n}`));

  parti.push(
    "",
    r.apri ? `Scheda sulla mappa: ${SITO}/mappa?comune=${r.apri}` : `Mappa: ${SITO}/mappa`,
    `Fonte: Parimetro, dati aperti ISTAT e SIOPE (cassa) e le altre fonti indicate su ${SITO}.`,
  );
  return parti.join("\n");
}
