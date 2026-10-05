// Disegno delle card su un <canvas>. Riceve il contesto di disegno (non il canvas), cosi' si prova anche senza browser.
// Le misure sono quelle del design: quadrata 1080x1080, verticale 1080x1920, larga 1200x630.

import { COLORE_RESTO, euro, type ContenutoCard, type TipoCard } from "./contenuto";

export interface Ambiente {
  /** Famiglie di caratteri gia' caricate (stringhe adatte a ctx.font) */
  serif: string;
  mono: string;
  sans: string;
  /** Indirizzo da stampare sulla card, es. "parimetro.pages.dev" */
  indirizzo: string;
}

export const DIMENSIONI: Record<TipoCard, { w: number; h: number }> = {
  cento: { w: 1080, h: 1080 },
  tre: { w: 1080, h: 1920 },
  domanda: { w: 1200, h: 630 },
};

// Notte (cards dei dati) e carta (la card della domanda)
const NOTTE = "#0A1018";
const TESTO = "#E8EEF5";
const MUTO = "#8FA3BB";
const SOFT = "#B9C7D8";
const OCRA = "#F2B544";
const CARTA = "#F4EFE4";
const INCHIOSTRO = "#1F2430";
const OCRA_SCURO = "#8A5300";
const MUTO_CARTA = "#6B6A60";

type Ctx = CanvasRenderingContext2D;

// ---------------------------------------------------------------- utilita'
function spaziatura(ctx: Ctx, px: number) {
  // letterSpacing non c'e' in tutti i browser: dove manca, il testo resta semplicemente senza spaziatura
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
}

function testo(ctx: Ctx, t: string, x: number, y: number, font: string, colore: string, allinea: CanvasTextAlign = "left", sp = 0) {
  ctx.font = font;
  ctx.fillStyle = colore;
  ctx.textAlign = allinea;
  ctx.textBaseline = "alphabetic";
  spaziatura(ctx, sp);
  ctx.fillText(t, x, y);
  spaziatura(ctx, 0);
}

/** Va a capo alle parole, dentro `larghezza`. */
export function avvolgi(ctx: { measureText(t: string): { width: number } }, t: string, larghezza: number): string[] {
  const righe: string[] = [];
  let corrente = "";
  for (const parola of t.split(/\s+/).filter(Boolean)) {
    const prova = corrente ? `${corrente} ${parola}` : parola;
    if (corrente && ctx.measureText(prova).width > larghezza) {
      righe.push(corrente);
      corrente = parola;
    } else {
      corrente = prova;
    }
  }
  if (corrente) righe.push(corrente);
  return righe;
}

function paragrafo(ctx: Ctx, t: string, x: number, y: number, larghezza: number, font: string, colore: string, interlinea: number, maxRighe = 99): number {
  ctx.font = font;
  const righe = avvolgi(ctx, t, larghezza).slice(0, maxRighe);
  righe.forEach((r, i) => testo(ctx, r, x, y + i * interlinea, font, colore));
  return y + righe.length * interlinea;
}

/** Il corpo piu' grande che ci sta nella larghezza, fra `max` e `min`. */
function adatta(ctx: Ctx, t: string, famiglia: string, peso: number, larghezza: number, max: number, min: number): number {
  let px = max;
  while (px > min) {
    ctx.font = `${peso} ${px}px ${famiglia}`;
    if (ctx.measureText(t).width <= larghezza) break;
    px -= 2;
  }
  return px;
}

function rettangolo(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, riempi: string) {
  ctx.fillStyle = riempi;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

/** Colonne decorative in fondo: richiamano la mappa 3D, non rappresentano alcun dato. */
function colonneDecorative(ctx: Ctx, w: number, yBase: number, alto: number) {
  const ramp = ["#2563EB", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444"];
  const n = 26;
  const larg = w / n;
  ctx.save();
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < n; i++) {
    const s = Math.sin(i * 12.9898) * 43758.5453;
    const q = 0.25 + 0.75 * (s - Math.floor(s));
    ctx.fillStyle = ramp[Math.min(ramp.length - 1, Math.floor(q * ramp.length))];
    const h = alto * q;
    ctx.fillRect(i * larg + 3, yBase - h, larg - 6, h);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- le tre card
function cento(ctx: Ctx, c: ContenutoCard, a: Ambiente) {
  const P = 72;
  ctx.fillStyle = NOTTE;
  ctx.fillRect(0, 0, 1080, 1080);

  testo(ctx, "Parimetro", P, P + 34, `600 40px ${a.serif}`, TESTO);
  testo(ctx, String(c.anno), 1080 - P, P + 30, `400 24px ${a.mono}`, MUTO, "right");

  testo(ctx, "OGNI 100 € CHE SPENDE", P, 196, `500 26px ${a.sans}`, MUTO, "left", 2.5);
  const px = adatta(ctx, c.titolo, a.serif, 500, 1080 - 2 * P, 112, 54);
  testo(ctx, c.titolo, P, 196 + px * 0.95 + 12, `500 ${px}px ${a.serif}`, TESTO);

  // 100 quadretti, uno per euro, riempiti per voce
  const lato = 48;
  const gap = 6;
  const x0 = P;
  const y0 = 410;
  let k = 0;
  for (const f of c.fette ?? []) {
    for (let i = 0; i < f.euro; i++, k++) {
      const col = k % 10;
      const riga = Math.floor(k / 10);
      rettangolo(ctx, x0 + col * (lato + gap), y0 + riga * (lato + gap), lato, lato, 7, f.colore);
    }
  }
  for (; k < 100; k++) {
    rettangolo(ctx, x0 + (k % 10) * (lato + gap), y0 + Math.floor(k / 10) * (lato + gap), lato, lato, 7, COLORE_RESTO);
  }

  // legenda
  const xl = x0 + 10 * lato + 9 * gap + 52;
  (c.fette ?? []).forEach((f, i) => {
    const y = y0 + 30 + i * 70;
    rettangolo(ctx, xl, y - 24, 24, 24, 6, f.colore);
    testo(ctx, `${f.euro} €`, xl + 116, y, `500 32px ${a.mono}`, TESTO, "right");
    testo(ctx, f.nome, xl + 130, y - 2, `400 23px ${a.sans}`, SOFT);
  });

  paragrafo(ctx, `Un quadretto = 1 €. ${c.avvertenza}`, P, 972, 700, `400 21px ${a.sans}`, MUTO, 29, 4);
  testo(ctx, a.indirizzo, 1080 - P, 1040, `500 23px ${a.mono}`, OCRA, "right");
}

function tre(ctx: Ctx, c: ContenutoCard, a: Ambiente) {
  const P = 80;
  ctx.fillStyle = NOTTE;
  ctx.fillRect(0, 0, 1080, 1920);
  // fra i numeri e le avvertenze: non deve coprire niente
  colonneDecorative(ctx, 1080, 1672, 200);

  testo(ctx, "Parimetro", P, P + 44, `600 48px ${a.serif}`, TESTO);
  testo(ctx, String(c.anno), 1080 - P, P + 38, `400 28px ${a.mono}`, MUTO, "right");

  testo(ctx, "IL MIO COMUNE IN TRE NUMERI", P, 270, `500 30px ${a.sans}`, MUTO, "left", 3);
  const px = adatta(ctx, c.titolo, a.serif, 500, 1080 - 2 * P, 150, 64);
  testo(ctx, c.titolo, P, 270 + px + 4, `500 ${px}px ${a.serif}`, TESTO);
  testo(ctx, c.sottotitolo, P, 270 + px + 70, `400 30px ${a.sans}`, SOFT);

  let y = 668;
  for (const n of c.numeri ?? []) {
    const vp = adatta(ctx, n.valore, a.mono, 500, 1080 - 2 * P, 128, 70);
    testo(ctx, n.valore, P, y + vp * 0.8, `500 ${vp}px ${a.mono}`, OCRA);
    const yEt = paragrafo(ctx, n.etichetta, P, y + vp * 0.8 + 58, 1080 - 2 * P, `400 36px ${a.sans}`, TESTO, 46, 2);
    paragrafo(ctx, n.confronto, P, yEt + 2, 1080 - 2 * P, `400 29px ${a.sans}`, SOFT, 38, 2);
    y += 280;
  }

  paragrafo(ctx, c.avvertenza, P, 1700, 1080 - 2 * P, `400 25px ${a.sans}`, MUTO, 36, 6);
  testo(ctx, a.indirizzo, P, 1868, `500 29px ${a.mono}`, OCRA);
}

function domanda(ctx: Ctx, c: ContenutoCard, a: Ambiente) {
  const d = c.domanda!;
  ctx.fillStyle = CARTA;
  ctx.fillRect(0, 0, 1200, 630);
  const P = 56;

  testo(ctx, "Parimetro", P, 48 + 24, `600 30px ${a.serif}`, INCHIOSTRO);
  testo(ctx, `UNA DOMANDA PER IL COMUNE DI ${c.titolo.toUpperCase()}`, 1200 - P, 48 + 20, `500 17px ${a.sans}`, MUTO_CARTA, "right", 1.6);

  testo(ctx, `${d.nome} · ${c.anno}`, P, 150, `400 20px ${a.sans}`, MUTO_CARTA);
  const val = euro(d.pc);
  testo(ctx, val, P, 250, `500 98px ${a.mono}`, OCRA_SCURO);
  ctx.font = `500 98px ${a.mono}`;
  const wVal = ctx.measureText(val).width;
  testo(ctx, "per abitante", P + wVal + 18, 250, `400 26px ${a.sans}`, "#45463F");
  testo(ctx, `contro ${euro(d.mediana)} nei comuni simili`, P, 296, `400 28px ${a.sans}`, "#45463F");

  const cx = 760;
  ctx.fillStyle = "#D9D0BE";
  ctx.fillRect(cx - 38, 140, 2, 170);
  testo(ctx, `IL COMUNE SPENDE ${d.direzione.toUpperCase()} DEI SIMILI`, cx, 164, `500 17px ${a.sans}`, MUTO_CARTA, "left", 1.6);
  const volte = (Math.round(d.rapporto * 10) / 10).toString().replace(".", ",");
  const frase =
    d.direzione === "più"
      ? `Circa ${volte} volte la mediana dei comuni della sua fascia.`
      : `La mediana dei comuni della sua fascia è circa ${volte} volte più alta.`;
  paragrafo(ctx, frase, cx, 204, 1200 - P - cx, `400 24px ${a.sans}`, "#2B2F38", 34, 4);

  // fascia scura con la domanda
  rettangolo(ctx, P, 360, 1200 - 2 * P, 116, 16, NOTTE);
  testo(ctx, "LA DOMANDA", P + 28, 396, `500 17px ${a.sans}`, OCRA, "left", 1.6);
  paragrafo(ctx, "Cosa spiega la differenza con i comuni simili?", P + 28, 444, 1200 - 2 * P - 56, `500 36px ${a.serif}`, CARTA, 40, 1);

  paragrafo(ctx, c.avvertenza, P, 520, 900, `400 16px ${a.sans}`, MUTO_CARTA, 23, 4);
  testo(ctx, a.indirizzo, 1200 - P, 600, `500 18px ${a.mono}`, OCRA_SCURO, "right");
}

export function disegna(ctx: Ctx, c: ContenutoCard, a: Ambiente) {
  if (c.tipo === "cento") cento(ctx, c, a);
  else if (c.tipo === "tre") tre(ctx, c, a);
  else domanda(ctx, c, a);
}

