import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { slugComune } from "@/lib/pagina/comune";
import type { ScopertaFatto } from "@/lib/viralita/genera";
import Condividi from "@/components/viralita/Condividi";

export const metadata: Metadata = {
  title: "Scoperte dai bilanci dei comuni · Parimetro",
  description: "Alcuni dati sorprendenti dai bilanci dei comuni italiani, con la fonte e il link alla scheda del comune.",
};

interface VoceIndice {
  istat: string;
  name: string;
}

// Letti a tempo di build dai file pubblicati: la pagina non ha bisogno di nessun server
function leggi<T>(percorso: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "public", percorso), "utf8")) as T;
}

export default function Scoperte() {
  const fatti = leggi<ScopertaFatto[]>("viralita/scoperte.json");
  const indice = leggi<VoceIndice[]>("dati/indice.json");
  const nomePer = new Map(indice.map((v) => [v.istat, v.name]));
  const coppie = leggi<{ slug: string; a: string; b: string }[]>("viralita/confronti.json");

  return (
    <main className="min-h-dvh bg-crema px-4 pb-16 font-testo text-lg leading-relaxed text-inchiostro sm:px-6">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between pt-6">
          <Link href="/" className="flex items-center gap-2" aria-label="Parimetro, torna alla home">
            <span className="h-3.5 w-12 rounded-full bg-mirtillo" aria-hidden="true" />
            <span className="h-3.5 w-7 rounded-full bg-limone" aria-hidden="true" />
            <span className="ml-1 font-display text-xl font-bold">Parimetro</span>
          </Link>
          <Link href="/gioco" className="text-base font-semibold underline-offset-4 hover:underline">Gioco</Link>
        </header>

        <h1 className="mt-10 font-display text-4xl font-semibold leading-tight sm:text-5xl">Scoperte dai bilanci dei comuni</h1>
        <p className="mt-4 text-xl leading-relaxed">
          Qualche dato che non ti aspetti, tratto dai bilanci ufficiali. Ogni scoperta ha il link alla fonte e al comune.
        </p>

        <ol className="mt-10 space-y-5">
          {fatti.map((f) => {
            const nome = f.istat ? nomePer.get(f.istat) : undefined;
            const url = `https://parimetro.it/${f.istat ? `comune/${slugComune(nomePer.get(f.istat) ?? "", f.istat)}` : "mappa"}`;
            return (
              <li key={f.id} className="rounded-[28px] border border-[#E8DEC8] bg-carta p-6">
                <h2 className="font-display text-2xl font-semibold">{f.titolo}</h2>
                <p className="mt-2 text-lg">{f.testo}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {f.istat && nome && (
                    <Link href={`/comune/${slugComune(nome, f.istat)}`} className="font-semibold text-mirtillo underline underline-offset-2">
                      Scheda di {nome}
                    </Link>
                  )}
                  <Condividi testo={`${f.titolo}: ${f.testo}`} url={url} etichetta="Condividi" />
                </div>
              </li>
            );
          })}
        </ol>

        <section className="mt-12" aria-labelledby="confronti">
          <h2 id="confronti" className="font-display text-3xl font-semibold">Confronti tra capoluoghi</h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {coppie.map((c) => (
              <li key={c.slug}>
                <Link href={`/confronto/${c.slug}`} className="block rounded-2xl border border-[#E8DEC8] bg-carta px-4 py-3 font-semibold hover:bg-sabbia/30">
                  {nomePer.get(c.a)} e {nomePer.get(c.b)}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-10 text-sm text-grigio">
          Dati di cassa (SIOPE), redditi IRPEF (MEF), popolazione ISTAT. Come sono calcolati i numeri:{" "}
          <Link href="/metodo" className="font-semibold text-mirtillo underline underline-offset-2">metodo</Link>.
        </p>
      </div>
    </main>
  );
}
