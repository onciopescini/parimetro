"use client";

import { useState } from "react";

/** Condivisione: il foglio nativo del telefono quando c'e', altrimenti copia negli appunti */
export default function Condividi({ testo, url, etichetta = "Condividi" }: { testo: string; url: string; etichetta?: string }) {
  const [copiato, setCopiato] = useState(false);

  async function condividi() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ text: testo, url });
        return;
      } catch {
        // annullato dall'utente: si prova la copia
      }
    }
    try {
      await navigator.clipboard.writeText(`${testo} ${url}`);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2500);
    } catch {
      // nessun appunto disponibile: il link resta visibile nella pagina
    }
  }

  return (
    <button
      type="button"
      onClick={condividi}
      className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-mirtillo px-7 text-lg font-semibold text-white shadow-[0_4px_0_#1B1A2E] transition active:translate-y-0.5 active:shadow-none"
    >
      {copiato ? "Copiato negli appunti" : etichetta}
    </button>
  );
}
