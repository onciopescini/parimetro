"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

const CAMPO = "mt-1 w-full rounded-2xl border border-[#E8DEC8] bg-white px-4 py-3 text-lg text-inchiostro";

/** Il modulo non invia niente da solo: prepara una email nel programma di posta di chi scrive. Nessun dato passa da noi. */
export default function ModuloSegnala() {
  const p = useSearchParams();
  const [comune, setComune] = useState(p.get("comune") ?? "");
  const [pagina, setPagina] = useState(p.get("pagina") ?? "");
  const [cosa, setCosa] = useState("");
  const [fonte, setFonte] = useState("");

  const oggetto = `Segnalazione su Parimetro${comune ? `: ${comune}` : ""}`;
  const corpo = [
    `Comune: ${comune || "(non indicato)"}`,
    `Pagina: ${pagina || "(non indicata)"}`,
    "",
    "Che cosa non torna:",
    cosa || "(da scrivere)",
    "",
    "Dove si può verificare (link o documento):",
    fonte || "(facoltativo)",
  ].join("\n");
  const href = `mailto:privacy@parimetro.it?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(corpo)}`;

  return (
    <form className="mt-6 space-y-5" onSubmit={(e) => e.preventDefault()}>
      <label className="block font-semibold">
        Comune
        <input className={CAMPO} value={comune} onChange={(e) => setComune(e.target.value)} placeholder="per esempio Campobasso" />
      </label>
      <label className="block font-semibold">
        Pagina (facoltativo)
        <input className={CAMPO} value={pagina} onChange={(e) => setPagina(e.target.value)} placeholder="l'indirizzo della pagina dove hai visto il numero" />
      </label>
      <label className="block font-semibold">
        Che cosa non torna
        <textarea className={CAMPO} rows={5} value={cosa} onChange={(e) => setCosa(e.target.value)} placeholder="Il numero, l'anno e perché pensi che sia sbagliato" />
      </label>
      <label className="block font-semibold">
        Dove si può verificare (facoltativo)
        <input className={CAMPO} value={fonte} onChange={(e) => setFonte(e.target.value)} placeholder="un link o il nome del documento" />
      </label>
      <a
        href={href}
        className="inline-flex min-h-14 items-center rounded-full bg-mirtillo px-7 text-lg font-semibold text-white shadow-[0_4px_0_#1B1A2E] transition active:translate-y-0.5 active:shadow-none"
      >
        Prepara la email
      </a>
      <p className="text-base text-grigio">
        Si apre il tuo programma di posta con il messaggio già scritto: lo controlli e lo invii tu. Se non si apre, scrivi a privacy@parimetro.it.
      </p>
    </form>
  );
}
