"use client";

// "Notizie": titoli di articoli di giornale su conti, tributi, appalti e fondi del comune.
// Solo titolo, fonte, data e link: gli articoli sono delle testate, qui si rimanda a loro.

import { dataBreve, linkSicuro, type NotizieComune } from "@/lib/notizie";

export default function NotizieComune({ notizie }: { notizie: NotizieComune | null }) {
  if (!notizie) return null;
  return (
    <div className="space-y-3">
      <section className="space-y-2 rounded-3xl border border-[#E8DEC8] bg-carta p-3">
        <h3 className="text-xs uppercase tracking-wider text-grigio">Notizie sui conti del comune</h3>
        {notizie.notizie.length === 0 ? (
          <p className="text-sm text-grigio">
            Negli ultimi mesi non ho trovato notizie su bilancio, tributi, appalti o fondi di questo comune.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {notizie.notizie.map((n) => {
              const href = linkSicuro(n.url);
              return (
                <li key={n.url} className="text-sm leading-snug">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-inchiostro underline-offset-2 hover:underline"
                    >
                      {n.titolo}
                    </a>
                  ) : (
                    <span className="text-inchiostro">{n.titolo}</span>
                  )}
                  <div className="text-xs text-grigio">
                    {n.fonte} · {dataBreve(n.data)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="text-xs leading-snug text-grigio">
        I link rimandano a testate esterne. Titoli e fonti sono scelti dal programma per parole chiave, non da una
        redazione, e Parimetro non ne verifica il contenuto: può includere articoli poco pertinenti o saltarne di
        importanti. Ultima ricerca: {dataBreve(notizie.raccolta_il)}.
      </p>
    </div>
  );
}
