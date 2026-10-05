// Disegno delle card su un <canvas> nell'identita' di Parimetro: fondo crema o mirtillo, colori piatti, forme
// tonde, numeri in Fraunces morbida. Riceve il contesto di disegno (non il canvas), cosi' si prova anche senza browser.
// Misure: quadrata 1080x1080, verticale 1080x1920, larga 1200x630.

import { COLORE_RESTO, euro, type ContenutoCard, type TipoCard } from "./contenuto";

export interface Ambiente {
  /** Famiglie di caratteri gia' caricate (stringhe adatte a ctx.font) */
  display: string;
  testo: string;
  codice: string;
  /** Indirizzo da stampare sulla card, es. "parimetro.it" */
  indirizzo: string;
}

export const DIMENSIONI: Record<TipoCard, { w: number; h: number }> = {
  cento: { w: 1080, h: 1080 },
  tre: { w: 1080, h: 1920 },
  confronto: { w: 1200, h: 630 },
};

const CREMA = "#FFF6E5";
const INCHIOSTRO = "#1B1A2E";
const MIRTILLO = "#3B3BD6";
const LIMONE = "#FFD23F";
const MENTA = "#2DBE8B";
const LILLA = "#B8A1FF";
const POMODORO = "#F0502D";
const GRIGIO = "#5A5873";
const TESTO2 = "#45435E";
const LINEA = "#E8DEC8";

type Ctx = CanvasRenderingContext2D;

// ---------------------------------------------------------------- utilita'
function spaziatura(ctx: Ctx, px: number) {
  // letterSpacing non c'e' in tutti i browser: dove manca, il testo resta senza spaziatura
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

/**
 * Le avvertenze stanno in fondo e non si tagliano mai: se non ci stanno in `maxRighe`, il carattere si rimpicciolisce
 * (fino a `minPx`); in ultimo si va a capo quanto serve. Restituisce la y sopra la prima riga, cosi' si sa dove
 * finisce lo spazio per il resto.
 */
function avvertenzeInBasso(ctx: Ctx, t: string, x: number, yUltima: number, larghezza: number, famiglia: string, colore: string, px: number, minPx: number, maxRighe: number): number {
  let corpo = px;
  let righe: string[] = [];
  for (;;) {
    ctx.font = `400 ${corpo}px ${famiglia}`;
    righe = avvolgi(ctx, t, larghezza);
    if (righe.length <= maxRighe || corpo <= minPx) break;
    corpo -= 1;
  }
  const lh = Math.round(corpo * 1.34);
  const y0 = yUltima - (righe.length - 1) * lh;
  righe.forEach((r, i) => testo(ctx, r, x, y0 + i * lh, `400 ${corpo}px ${famiglia}`, colore));
  return y0 - lh;
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

function larghezzaTesto(ctx: Ctx, t: string, font: string): number {
  ctx.font = font;
  return ctx.measureText(t).width;
}

function rettangolo(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, riempi: string) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.fillStyle = riempi;
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

function contorno(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, colore: string, spessore: number) {
  const m = spessore / 2;
  const rr = Math.min(r, w / 2 - m, h / 2 - m);
  ctx.strokeStyle = colore;
  ctx.lineWidth = spessore;
  ctx.beginPath();
  ctx.moveTo(x + m + rr, y + m);
  ctx.arcTo(x + w - m, y + m, x + w - m, y + h - m, rr);
  ctx.arcTo(x + w - m, y + h - m, x + m, y + h - m, rr);
  ctx.arcTo(x + m, y + h - m, x + m, y + m, rr);
  ctx.arcTo(x + m, y + m, x + w - m, y + m, rr);
  ctx.closePath();
  ctx.stroke();
}

/** Il segno di Parimetro: due pillole di lunghezza diversa, un confronto. */
function segno(ctx: Ctx, x: number, y: number, lato: number, sfondo: string, barra1: string, barra2: string) {
  rettangolo(ctx, x, y, lato, lato, lato * 0.32, sfondo);
  const h = lato * 0.17;
  const gap = lato * 0.12;
  const top = y + (lato - (2 * h + gap)) / 2;
  rettangolo(ctx, x + lato * 0.2, top, lato * 0.43, h, h / 2, barra1);
  rettangolo(ctx, x + lato * 0.2, top + h + gap, lato * 0.6, h, h / 2, barra2);
}

/** Una pillola con del testo dentro; restituisce la larghezza, cosi' si possono mettere in fila. */
function adesivo(ctx: Ctx, t: string, x: number, y: number, h: number, font: string, sfondo: string, colore: string, bordo?: string): number {
  const w = larghezzaTesto(ctx, t, font) + h * 0.9;
  rettangolo(ctx, x, y, w, h, h / 2, sfondo);
  if (bordo) contorno(ctx, x, y, w, h, h / 2, bordo, 3);
  testo(ctx, t, x + w / 2, y + h * 0.68, font, colore, "center");
  return w;
}

function pillolaUrl(ctx: Ctx, a: Ambiente, destra: number, y: number, h: number, corpo: number, sfondo: string, colore: string) {
  const font = `500 ${corpo}px ${a.codice}`;
  const w = larghezzaTesto(ctx, a.indirizzo, font) + h * 1.0;
  rettangolo(ctx, destra - w, y, w, h, h / 2, sfondo);
  testo(ctx, a.indirizzo, destra - w / 2, y + h * 0.66, font, colore, "center");
}

// ---------------------------------------------------------------- ogni 100 euro
function cento(ctx: Ctx, c: ContenutoCard, a: Ambiente) {
  const P = 64;
  ctx.fillStyle = CREMA;
  ctx.fillRect(0, 0, 1080, 1080);

  segno(ctx, P, P, 60, MIRTILLO, CREMA, LIMONE);
  testo(ctx, "Parimetro", P + 76, P + 43, `700 38px ${a.display}`, INCHIOSTRO);
  const annoFont = `400 22px ${a.codice}`;
  const wAnno = larghezzaTesto(ctx, String(c.anno), annoFont) + 44;
  rettangolo(ctx, 1080 - P - wAnno, P + 8, wAnno, 44, 22, INCHIOSTRO);
  testo(ctx, String(c.anno), 1080 - P - wAnno / 2, P + 38, annoFont, CREMA, "center");

  testo(ctx, "OGNI 100 € CHE SPENDE", P, 200, `400 24px ${a.codice}`, GRIGIO, "left", 1.5);
  const px = adatta(ctx, c.titolo, a.display, 700, 1080 - 2 * P, 132, 60);
  const base = 200 + px * 0.92 + 6;
  testo(ctx, c.titolo, P, base, `700 ${px}px ${a.display}`, INCHIOSTRO);

  // 100 quadretti, uno per euro, riempiti per voce
  const lato = 48;
  const gap = 6;
  const y0 = Math.max(378, base + 36);
  let k = 0;
  for (const f of c.fette ?? []) {
    for (let i = 0; i < f.euro; i++, k++) {
      rettangolo(ctx, P + (k % 10) * (lato + gap), y0 + Math.floor(k / 10) * (lato + gap), lato, lato, 15, f.colore);
    }
  }
  for (; k < 100; k++) {
    rettangolo(ctx, P + (k % 10) * (lato + gap), y0 + Math.floor(k / 10) * (lato + gap), lato, lato, 15, COLORE_RESTO);
  }

  // legenda
  const xl = P + 10 * lato + 9 * gap + 46;
  (c.fette ?? []).forEach((f, i) => {
    const y = y0 + 30 + i * 64;
    rettangolo(ctx, xl, y - 26, 26, 26, 9, f.colore);
    testo(ctx, `${f.euro} €`, xl + 128, y, `700 34px ${a.display}`, INCHIOSTRO, "right");
    testo(ctx, f.nome, xl + 144, y - 2, `500 22px ${a.testo}`, TESTO2);
  });

  // fonte e avvertenze, sempre (mai tagliate, mai sotto l'indirizzo)
  const yPrima = avvertenzeInBasso(ctx, c.avvertenza, P, 1050, 640, a.testo, GRIGIO, 18, 14, 3);
  let x = P;
  x += adesivo(ctx, `dati di cassa ${c.anno}`, x, yPrima - 56, 42, `700 20px ${a.testo}`, LIMONE, INCHIOSTRO) + 10;
  adesivo(ctx, "fonte SIOPE", x, yPrima - 56, 42, `700 20px ${a.testo}`, MENTA, INCHIOSTRO);
  pillolaUrl(ctx, a, 1080 - P, 1050 - 40, 52, 21, MIRTILLO, "#FFFFFF");
}

// ---------------------------------------------------------------- tre numeri
function tre(ctx: Ctx, c: ContenutoCard, a: Ambiente) {
  const P = 72;
  ctx.fillStyle = MIRTILLO;
  ctx.fillRect(0, 0, 1080, 1920);

  segno(ctx, P, 84, 68, CREMA, MIRTILLO, POMODORO);
  testo(ctx, "Parimetro", P + 86, 84 + 48, `700 44px ${a.display}`, "#FFFFFF");
  const annoFont = `400 26px ${a.codice}`;
  const wAnno = larghezzaTesto(ctx, String(c.anno), annoFont) + 48;
  rettangolo(ctx, 1080 - P - wAnno, 84 + 9, wAnno, 50, 25, CREMA);
  testo(ctx, String(c.anno), 1080 - P - wAnno / 2, 84 + 43, annoFont, INCHIOSTRO, "center");

  testo(ctx, "IL MIO COMUNE IN TRE NUMERI", P, 300, `400 26px ${a.codice}`, "#CFCFFF", "left", 1.5);
  const px = adatta(ctx, c.titolo, a.display, 700, 1080 - 2 * P, 176, 70);
  testo(ctx, c.titolo, P, 300 + px * 0.95 + 8, `700 ${px}px ${a.display}`, "#FFFFFF");
  testo(ctx, c.sottotitolo, P, 300 + px * 0.95 + 66, `400 30px ${a.testo}`, "#E4E4FF");

  const blocchi = [
    { sf: LIMONE, sotto: "#3A2F00" },
    { sf: MENTA, sotto: "#0B3B2B" },
    { sf: LILLA, sotto: "#2A1A66" },
  ];
  let y = 616;
  (c.numeri ?? []).forEach((n, i) => {
    const b = blocchi[i % blocchi.length];
    rettangolo(ctx, P, y, 1080 - 2 * P, 318, 56, b.sf);
    const vp = adatta(ctx, n.valore, a.display, 700, 1080 - 2 * P - 88, 124, 70);
    testo(ctx, n.valore, P + 44, y + 44 + vp * 0.82, `700 ${vp}px ${a.display}`, INCHIOSTRO);
    const yEt = paragrafo(ctx, n.etichetta, P + 44, y + 44 + vp * 0.82 + 56, 1080 - 2 * P - 88, `600 34px ${a.testo}`, INCHIOSTRO, 42, 2);
    paragrafo(ctx, n.confronto, P + 44, yEt + 2, 1080 - 2 * P - 88, `400 26px ${a.testo}`, b.sotto, 34, 2);
    y += 318 + 22;
  });

  // fonte e avvertenze, sempre (mai tagliate)
  const yPrima = avvertenzeInBasso(ctx, c.avvertenza, P, 1812, 1080 - 2 * P, a.testo, "#E4E4FF", 23, 17, 5);
  let x = P;
  x += adesivo(ctx, `dati di cassa ${c.anno}`, x, yPrima - 62, 46, `700 22px ${a.testo}`, CREMA, INCHIOSTRO) + 10;
  adesivo(ctx, "fonti SIOPE · ANAC", x, yPrima - 62, 46, `700 22px ${a.testo}`, CREMA, INCHIOSTRO);
  pillolaUrl(ctx, a, 1080 - P, 1850, 54, 24, CREMA, MIRTILLO);
}

// ---------------------------------------------------------------- larga: confronto
function larga(ctx: Ctx, c: ContenutoCard, a: Ambiente) {
  const P = 56;
  ctx.fillStyle = CREMA;
  ctx.fillRect(0, 0, 1200, 630);

  segno(ctx, P, 40, 46, MIRTILLO, CREMA, LIMONE);
  testo(ctx, "Parimetro", P + 60, 40 + 33, `700 30px ${a.display}`, INCHIOSTRO);
  testo(ctx, `SPESA PER ABITANTE · ${c.anno}`, 1200 - P, 40 + 28, `400 17px ${a.codice}`, GRIGIO, "right", 1.2);

  const k = c.confronto;
  if (!k) return;
  const verbo = k.direzione === "in linea" ? "spende quanto i" : `spende ${k.direzione} dei`;
  const titolo = `${c.titolo} ${verbo} comuni come lui.`;
  const px = adatta(ctx, titolo, a.display, 700, 1200 - 2 * P, 56, 34);
  ctx.font = `700 ${px}px ${a.display}`;
  const righe = avvolgi(ctx, titolo, 1200 - 2 * P).slice(0, 2);
  righe.forEach((r, i) => testo(ctx, r, P, 160 + i * (px * 1.06), `700 ${px}px ${a.display}`, INCHIOSTRO));
  const yBarre = 160 + (righe.length - 1) * px * 1.06 + 44;

  const v1 = k.comune;
  const v2 = k.simili;
  const max = Math.max(v1, v2);
  const wMax = 760;
  const w1 = Math.max(70, (wMax * v1) / max);
  const w2 = Math.max(70, (wMax * v2) / max);
  const nomeComune = c.titolo.length > 14 ? c.titolo.slice(0, 13) + "…" : c.titolo;
  const H = 60;
  // simili: pillola vuota col bordo; comune: pillola piena
  testo(ctx, "Comuni simili", P, yBarre + 38, `600 22px ${a.testo}`, GRIGIO);
  contorno(ctx, P + 190, yBarre, w2, H, 30, MIRTILLO, 5);
  testo(ctx, euro(v2), P + 190 + w2 + 18, yBarre + 42, `600 38px ${a.display}`, INCHIOSTRO);
  testo(ctx, nomeComune, P, yBarre + 82 + 38, `700 22px ${a.testo}`, INCHIOSTRO);
  rettangolo(ctx, P + 190, yBarre + 82, w1, H, 30, MIRTILLO);
  testo(ctx, euro(v1), P + 190 + w1 + 18, yBarre + 82 + 42, `700 38px ${a.display}`, INCHIOSTRO);

  // adesivo con la differenza
  const diff = k.differenza;
  const segnoDiff = k.direzione === "più" ? "+" : k.direzione === "meno" ? "−" : "";
  const testoAdesivo = k.direzione === "in linea" ? "in linea" : `${segnoDiff}${euro(diff)}`;
  const fa = `700 42px ${a.display}`;
  const wa = larghezzaTesto(ctx, testoAdesivo, fa) + 52;
  ctx.save();
  ctx.translate(1200 - P - wa / 2 - 4, yBarre + 36);
  ctx.rotate((4 * Math.PI) / 180);
  ctx.shadowColor = "rgba(27,26,46,0.14)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  rettangolo(ctx, -wa / 2, -30, wa, 60, 30, LIMONE);
  ctx.shadowColor = "transparent";
  testo(ctx, testoAdesivo, 0, 14, fa, INCHIOSTRO, "center");
  ctx.restore();

  const yDopo = yBarre + 82 + H + 34;
  // come si legge: serve a chi non conosce questo tipo di grafico
  testo(ctx, "Pillola piena: il comune. Pillola vuota: la mediana dei comuni della sua dimensione.", P, yDopo + 10, `400 19px ${a.testo}`, TESTO2);

  // fonte e avvertenze, sempre (mai tagliate, mai sotto l'indirizzo)
  const yPrima = avvertenzeInBasso(ctx, c.avvertenza, P, 604, 800, a.testo, GRIGIO, 14, 11, 3);
  let x = P;
  x += adesivo(ctx, "fonte SIOPE", x, yPrima - 46, 34, `700 16px ${a.testo}`, MENTA, INCHIOSTRO) + 8;
  adesivo(ctx, `dati di cassa ${c.anno}`, x, yPrima - 46, 34, `700 16px ${a.testo}`, "#FFFFFF", INCHIOSTRO, LINEA);
  pillolaUrl(ctx, a, 1200 - P, 630 - 40 - 46, 46, 18, MIRTILLO, "#FFFFFF");
}

export function disegna(ctx: Ctx, c: ContenutoCard, a: Ambiente) {
  if (c.tipo === "cento") cento(ctx, c, a);
  else if (c.tipo === "tre") tre(ctx, c, a);
  else larga(ctx, c, a);
}
