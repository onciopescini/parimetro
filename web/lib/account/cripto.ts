// Piccole funzioni di crittografia con WebCrypto (disponibile nelle Pages Functions e in Node 20+).
// I codici di accesso e di sessione non si salvano mai in chiaro: nel database c'e' solo la loro impronta.

const enc = new TextEncoder();

const base64url = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Un codice casuale lungo e impossibile da indovinare (256 bit). */
export function codiceCasuale(byte = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byte)));
}

/** Impronta SHA-256 in esadecimale. */
export async function impronta(testo: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(testo));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function chiaveHmac(segreto: string) {
  return crypto.subtle.importKey("raw", enc.encode(segreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Firma un testo con un segreto: serve per i link di disiscrizione, che non devono essere falsificabili. */
export async function firma(testo: string, segreto: string): Promise<string> {
  const k = await chiaveHmac(segreto);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(testo))));
}

/** Confronto che non svela dove le due stringhe differiscono. */
export function ugualiACostoFisso(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function firmaValida(testo: string, f: string, segreto: string): Promise<boolean> {
  return ugualiACostoFisso(await firma(testo, segreto), f);
}
