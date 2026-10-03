"use client";

// "Notizie": titoli di articoli di giornale su conti, tributi, appalti e fondi del comune.
// Solo titolo, fonte, data e link: gli articoli sono delle testate, qui si rimanda a loro.

import { dataBreve, linkSicuro, type NotizieComune } from "@/lib/notizie";

export default function NotizieComune({ notizie }: { notizie: NotizieComune | null }) {
  if (!notizie) return null;
  return (
    <div className="space-y-3">
      <section className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
        <h3 className="text-[11px] uppercase tracking-wider text-slate-400">Notizie sui conti del comune</h3>
        {notizie.notizie.length === 0 ? (
          <p className="text-xs text-slate-400">
            Negli ultimi mesi non ho trovato notizie su bilancio, tributi, appalti o fondi di questo comune.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {notizie.notizie.map((n) => {
              const href = linkSicuro(n.url);
              return (
                <li key={n.url} className="text-xs leading-snug">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-sky-300 underline-offset-2 hover:underline"
                    >
                      {n.titolo}
                    </a>
                  ) : (
                    <span className="text-slate-200">{n.titolo}</span>
                  )}
                  <div className="text-[10px] text-slate-500">
                    {n.fonte} · {dataBreve(n.data)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="text-[10px] leading-snug text-slate-500">
        I link rimandano a testate esterne. Titoli e fonti sono scelti dal programma per parole chiave, non da una
        redazione, e Parimetro non ne verifica il contenuto: può includere articoli poco pertinenti o saltarne di
        importanti. Ultima ricerca: {dataBreve(notizie.raccolta_il)}.
      </p>
    </div>
  );
}
