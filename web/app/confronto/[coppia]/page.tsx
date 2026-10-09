import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { slugComune } from "@/lib/pagina/comune";
import { confrontoRighe, datoComune, type DatoComune } from "@/lib/viralita/genera";
import Condividi from "@/components/viralita/Condividi";

export const dynamicParams = false;

interface Coppia {
  slug: string;
  a: string;
  b: string;
}
interface VoceIndice {
  istat: string;
  name: string;
  province: string;
  region: string;
  population: number;
}

// Tutto viene letto a tempo di build: il sito resta statico
function leggi<T>(percorso: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "public", percorso), "utf8")) as T;
}

const coppie = () => leggi<Coppia[]>("viralita/confronti.json");

export function generateStaticParams() {
  return coppie().map((c) => ({ coppia: c.slug }));
}

function datoDi(istat: string, indice: VoceIndice[]): DatoComune {
  const voce = indice.find((v) => v.istat === istat);
  if (!voce) throw new Error(`comune ${istat} non nell'indice`);
  return datoComune(voce, leggi(`dati/comune/${istat}.json`));
}

export async function generateMetadata({ params }: { params: Promise<{ coppia: string }> }): Promise<Metadata> {
  const { coppia } = await params;
  const c = coppie().find((x) => x.slug === coppia);
  const indice = leggi<VoceIndice[]>("dati/indice.json");
  if (!c) return {};
  const a = datoDi(c.a, indice);
  const b = datoDi(c.b, indice);
  return {
    title: `${a.name} e ${b.name}: bilanci a confronto · Parimetro`,
    description: `Spesa, entrate, autonomia e reddito di ${a.name} e ${b.name}, con i dati ufficiali di cassa 2024.`,
  };
}

export default async function Confronto({ params }: { params: Promise<{ coppia: string }> }) {
  const { coppia } = await params;
  const c = coppie().find((x) => x.slug === coppia);
  if (!c) return null;
  const indice = leggi<VoceIndice[]>("dati/indice.json");
  const a = datoDi(c.a, indice);
  const b = datoDi(c.b, indice);
  const righe = confrontoRighe(a, b);
  const url = `https://parimetro.it/confronto/${coppia}`;
  const sa = slugComune(a.name, a.istat);
  const sb = slugComune(b.name, b.istat);

  return (
    <main className="min-h-dvh bg-crema px-4 pb-16 font-testo text-lg leading-relaxed text-inchiostro sm:px-6">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between pt-6">
          <Link href="/" className="flex items-center gap-2" aria-label="Parimetro, torna alla home">
            <span className="h-3.5 w-12 rounded-full bg-mirtillo" aria-hidden="true" />
            <span className="h-3.5 w-7 rounded-full bg-limone" aria-hidden="true" />
            <span className="ml-1 font-display text-xl font-bold">Parimetro</span>
          </Link>
          <Link href="/comuni" className="text-base font-semibold underline-offset-4 hover:underline">Comuni</Link>
        </header>

        <h1 className="mt-10 font-display text-4xl font-semibold leading-tight sm:text-5xl">
          {a.name} e {b.name}: bilanci a confronto
        </h1>
        <p className="mt-4 text-xl leading-relaxed">
          Dati di cassa 2024: quanto incassano e pagano i due comuni, e come si confrontano con i comuni della loro fascia.
        </p>

        <div className="mt-8 overflow-hidden rounded-[28px] border border-[#E8DEC8] bg-carta">
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-[#E8DEC8] text-left text-sm uppercase tracking-wide text-grigio">
                <th scope="col" className="p-3"> </th>
                <th scope="col" className="p-3 text-right">{a.name}</th>
                <th scope="col" className="p-3 text-right">{b.name}</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.etichetta} className="border-b border-[#E8DEC8] last:border-0">
                  <th scope="row" className="p-3 text-left font-semibold">{r.etichetta}</th>
                  <td className="p-3 text-right font-codice">{r.a}</td>
                  <td className="p-3 text-right font-codice">{r.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(a.concentrata || b.concentrata) && (
          <p className="mt-4 rounded-3xl bg-limone/40 p-4 text-base">
            Attenzione: per {[a.concentrata && a.name, b.concentrata && b.name].filter(Boolean).join(" e ")} una sola voce di spesa pesa più del 40%.
            Il dato per abitante di quell&apos;anno non è confrontabile.
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`/comune/${sa}`} className="inline-flex min-h-12 items-center rounded-full border border-[#E8DEC8] bg-carta px-6 font-semibold">
            Scheda di {a.name}
          </Link>
          <Link href={`/comune/${sb}`} className="inline-flex min-h-12 items-center rounded-full border border-[#E8DEC8] bg-carta px-6 font-semibold">
            Scheda di {b.name}
          </Link>
        </div>

        <div className="mt-8">
          <Condividi testo={`${a.name} o ${b.name}? Il confronto dei bilanci, con i dati ufficiali.`} url={url} etichetta="Condividi il confronto" />
        </div>

        <p className="mt-10 text-sm text-grigio">
          Dati di cassa (SIOPE): incassi e pagamenti, non il bilancio approvato. Il rango è una posizione da 0 a 100, non un voto.{" "}
          <Link href="/metodo" className="font-semibold text-mirtillo underline underline-offset-2">Come sono calcolati i numeri</Link>.
        </p>
      </div>
    </main>
  );
}
