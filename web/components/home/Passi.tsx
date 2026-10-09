"use client";

import { useInView } from "./useInView";

const PASSI: { n: string; titolo: string; testo: string; colore: string }[] = [
  { n: "1", titolo: "Trova il tuo comune", testo: "Cerca il nome nella mappa. Ogni comune è un blocco: più è alto, più spende per abitante.", colore: "bg-mirtillo text-white" },
  { n: "2", titolo: "Leggi la scheda", testo: "Dove vanno i soldi, come sono andati i conti negli anni e come si confronta con i comuni simili.", colore: "bg-limone text-inchiostro" },
  { n: "3", titolo: "Fai una domanda", testo: "Chiedi alla chat, per esempio: «Quanto spende Roma per i rifiuti?». Puoi anche creare una card da condividere.", colore: "bg-menta text-inchiostro" },
];

/** I tre passi: ciascuno compare quando arriva nello schermo, uno dopo l'altro */
export default function Passi() {
  const { ref, visto } = useInView<HTMLOListElement>(0.2);
  return (
    <ol ref={ref} className="passi mt-8 grid gap-4 sm:grid-cols-3">
      <noscript>
        <style>{`.passi li{opacity:1!important;transform:none!important}`}</style>
      </noscript>
      {PASSI.map((p, i) => (
        <li
          key={p.n}
          className="rounded-[32px] border border-[#E8DEC8] bg-carta p-6 transition duration-700 ease-out"
          style={{ opacity: visto ? 1 : 0, transform: visto ? "none" : "translateY(16px)", transitionDelay: `${i * 150}ms` }}
        >
          <span className={`grid size-12 place-items-center rounded-full font-display text-xl font-bold ${p.colore}`}>{p.n}</span>
          <h3 className="mt-4 font-display text-2xl font-semibold">{p.titolo}</h3>
          <p className="mt-2 text-base text-grigio">{p.testo}</p>
        </li>
      ))}
    </ol>
  );
}
