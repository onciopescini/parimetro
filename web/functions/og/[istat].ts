// GET /og/070006.png : l'immagine di anteprima di un comune (quella che compare quando si incolla il link in
// WhatsApp, Telegram, ecc.). Si disegna qui al volo dai JSON gia' pubblicati: nessun file in piu' nel sito
// (Cloudflare Pages ne accetta 20.000) e la risposta resta in cache per un giorno.
import { ImageResponse } from "workers-og";
import { type DatiComune, type VoceComune } from "../../lib/pagina/comune";
import type { Assets } from "../../lib/pagina/serve";

interface Ctx {
  request: Request;
  env: { ASSETS: Assets };
  params: { istat?: string | string[] };
}

const euro = (n: number) => `${Math.round(n).toLocaleString("it-IT")} €`;

async function font(assets: Assets, origine: string, file: string): Promise<ArrayBuffer> {
  const r = await assets.fetch(new Request(`${origine}/fonts/${file}`));
  if (!r.ok) throw new Error(`font ${file}: HTTP ${r.status}`);
  return r.arrayBuffer();
}

export const onRequest = async ({ request, env, params }: Ctx): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Metodo non consentito", { status: 405 });
  const origine = new URL(request.url).origin;
  const istat = String(Array.isArray(params.istat) ? params.istat[0] : params.istat ?? "").replace(/\.png$/, "");
  const generica = istat === "parimetro";
  if (!generica && !/^\d{6}$/.test(istat)) return new Response("Non trovato", { status: 404 });

  try {
    const [indice, dati] = generica
      ? [[] as VoceComune[], null]
      : await Promise.all([
          env.ASSETS.fetch(new Request(`${origine}/dati/indice.json`)).then((r) => r.json() as Promise<VoceComune[]>),
          env.ASSETS.fetch(new Request(`${origine}/dati/comune/${istat}.json`)).then((r) => (r.ok ? (r.json() as Promise<DatiComune>) : null)),
        ]);
    const v: VoceComune | undefined = generica
      ? { istat: "", name: "I bilanci dei comuni italiani", region: "", province: "", population: 0, lon: 0, lat: 0 }
      : indice.find((c) => c.istat === istat);
    if (!v || (!generica && !dati)) return new Response("Non trovato", { status: 404 });
    const ultimo = generica || !dati ? undefined : [...dati.history].reverse().find((h) => h.expenditure_pc != null);
    const anno = ultimo?.year ?? null;

    type No = { type: string; props: { style: Record<string, string | number>; children: No[] | string } };
    const d = (style: Record<string, string | number>, children: No[] | string): No => ({ type: "div", props: { style: { display: "flex", ...style }, children } });
    const riga = (etichetta: string, valore: string) =>
      d({ flexDirection: "column", marginRight: 56 }, [
        d({ fontSize: 30, color: "#6B6880" }, etichetta),
        d({ fontSize: 64, fontWeight: 700, color: "#1B1A2E" }, valore),
      ]);
    const numeri: No[] =
      ultimo && anno
        ? [riga(`Spesa per abitante, ${anno}`, euro(ultimo.expenditure_pc!)), ...(ultimo.revenue_pc != null ? [riga("Entrate per abitante", euro(ultimo.revenue_pc))] : [])]
        : generica
          ? [d({ fontSize: 40, color: "#1B1A2E" }, "Quanto spende il tuo comune? Entrate, spese, PNRR e appalti, con le fonti.")]
          : [d({ fontSize: 36, color: "#6B6880" }, "Dati dei bilanci non disponibili")];
    const html = d(
      { flexDirection: "column", justifyContent: "space-between", width: 1200, height: 630, padding: 64, background: "#FBF5E6", fontFamily: "Figtree" },
      [
        d({ fontSize: 34, fontWeight: 700, color: "#3D3A8C" }, "Parimetro"),
        d({ flexDirection: "column" }, [
          d({ fontFamily: "Fraunces", fontSize: v.name.length > 18 ? 84 : 108, color: "#1B1A2E", lineHeight: 1.05 }, v.name),
          ...(generica ? [] : [d({ fontSize: 34, color: "#6B6880", marginTop: 12 }, `${v.province} - ${v.region} - ${v.population.toLocaleString("it-IT")} abitanti`)]),
        ]),
        d({}, numeri),
        d({ fontSize: 26, color: "#6B6880" }, "parimetro.it - dati ufficiali SIOPE e ISTAT, dati di cassa"),
      ],
    );

    const [f400, f700, fr] = await Promise.all([font(env.ASSETS, origine, "figtree-400.ttf"), font(env.ASSETS, origine, "figtree-700.ttf"), font(env.ASSETS, origine, "fraunces-600.ttf")]);
    const img = new ImageResponse(html as unknown as string, {
      width: 1200,
      height: 630,
      format: "png",
      fonts: [
        { name: "Figtree", data: f400, weight: 400, style: "normal" },
        { name: "Figtree", data: f700, weight: 700, style: "normal" },
        { name: "Fraunces", data: fr, weight: 400, style: "normal" },
      ],
    });
    const corpo = await img.arrayBuffer();
    return new Response(request.method === "HEAD" ? null : corpo, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    });
  } catch (e) {
    console.warn("og", e instanceof Error ? e.message : "errore");
    return new Response("Immagine non disponibile", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
};
