// Le rotte dell'accesso, scritte come funzioni pure (Request + ambiente -> Response): le Pages Functions in
// functions/api/auth, /me e /avvisi si limitano a chiamare route(). Cosi' si provano senza avviare un server.
import { firma, firmaValida } from "./cripto";
import { inviaEmail, messaggioAccesso, messaggioAvviso, type AmbienteEmail } from "./email";
import {
  LIMITE_EMAIL_ORA,
  LIMITE_IP_ORA,
  chiudiSessione,
  cancellaUtente,
  creaCodiceAccesso,
  creaSessione,
  daAvvisare,
  elencaCard,
  elencaComuni,
  elencaDomande,
  eliminaCard,
  eliminaDomande,
  esportaTutto,
  impostaAvviso,
  pulisci,
  registraCard,
  registraDomanda,
  salvaComune,
  segnaAvvisati,
  spendiCodice,
  superaLimite,
  togliComune,
  utenteDaSessione,
  utentePerEmail,
  DURATA_CODICE_S,
  DURATA_SESSIONE_S,
  type D1,
  type Utente,
} from "./servizio";
import { impronta } from "./cripto";
import { annoValido, istatValido, nomeComune, normalizzaEmail, testoDomanda, tipoCardValido } from "./validazione";

export interface Ambiente extends AmbienteEmail {
  DB?: D1;
  /** Segreto per firmare i link di disiscrizione */
  SEGRETO_ACCESSO?: string;
  /** Chi pubblica i dati lo presenta per far partire gli avvisi */
  ADMIN_TOKEN?: string;
}

const NOME_COOKIE = "parimetro_sessione";
const NOME_COOKIE_SICURO = "__Host-parimetro_sessione";

const intestazioniBase = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

const json = (corpo: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...intestazioniBase, ...extra },
  });

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function pagina(titolo: string, corpo: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titolo)} · Parimetro</title></head>
<body style="margin:0;background:#FFF6E5;color:#1B1A2E;font-family:Figtree,system-ui,sans-serif;font-size:18px;line-height:1.5">
<main style="max-width:480px;margin:0 auto;padding:40px 20px"><p style="margin:0 0 24px"><span style="display:inline-block;width:44px;height:12px;border-radius:6px;background:#3B3BD6"></span> <span style="display:inline-block;width:26px;height:12px;border-radius:6px;background:#FFD23F"></span> <strong>Parimetro</strong></p>
<div style="background:#FFFDF8;border:1px solid #E8DEC8;border-radius:28px;padding:28px">${corpo}</div>
<p style="margin:20px 4px"><a href="/mappa" style="color:#3B3BD6">Torna alla mappa</a></p></main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", ...intestazioniBase } },
  );
}

const bottonePieno = (testo: string) =>
  `<button type="submit" style="min-height:48px;border:0;border-radius:999px;background:#3B3BD6;color:#fff;font:inherit;font-weight:700;padding:0 28px;cursor:pointer">${esc(testo)}</button>`;

// ------------------------------------------------------------------ cookie e origine
const siCookie = (richiesta: Request) => new URL(richiesta.url).protocol === "https:";

export function leggiCookie(richiesta: Request): string | null {
  const grezzo = richiesta.headers.get("Cookie");
  if (!grezzo) return null;
  for (const parte of grezzo.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === NOME_COOKIE || k === NOME_COOKIE_SICURO) return v.join("=") || null;
  }
  return null;
}

export function cookieSessione(richiesta: Request, token: string | null): string {
  const sicuro = siCookie(richiesta);
  const nome = sicuro ? NOME_COOKIE_SICURO : NOME_COOKIE;
  const base = `${nome}=${token ?? ""}; Path=/; HttpOnly; SameSite=Lax${sicuro ? "; Secure" : ""}`;
  return token ? `${base}; Max-Age=${DURATA_SESSIONE_S}` : `${base}; Max-Age=0`;
}

/** Le richieste che cambiano qualcosa devono partire dal nostro stesso sito. */
function stessaOrigine(richiesta: Request): boolean {
  const o = richiesta.headers.get("Origin");
  if (o) {
    try {
      return new URL(o).host === new URL(richiesta.url).host;
    } catch {
      return false;
    }
  }
  const s = richiesta.headers.get("Sec-Fetch-Site");
  return s === "same-origin" || s === "none";
}

async function leggiJson(richiesta: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = await richiesta.json();
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const adesso = () => Math.floor(Date.now() / 1000);

async function ipImpronta(richiesta: Request) {
  return (await impronta(richiesta.headers.get("CF-Connecting-IP") ?? "ignoto")).slice(0, 24);
}

// ------------------------------------------------------------------ rotte
export async function route(richiesta: Request, env: Ambiente, ora: number = adesso()): Promise<Response> {
  const url = new URL(richiesta.url);
  const percorso = url.pathname.replace(/\/+$/, "");
  const metodo = richiesta.method;

  // L'accesso e' attivo solo con un database E un modo di mandare le email: altrimenti l'interfaccia non compare
  if (!env.DB || !(env.RESEND_API_KEY || env.EMAIL || env.ACCESSO_PROVA === "1")) {
    return json({ errore: "L'accesso non è ancora attivo su questo sito." }, 503);
  }
  const db = env.DB;

  // Gli avvisi li fa partire chi pubblica i dati, con un programma: non ha un'origine, ha un token
  if (percorso === "/api/avvisi/invia" && metodo === "POST") return inviaAvvisi(richiesta, env, db, url, ora);

  if (metodo !== "GET" && metodo !== "HEAD" && !stessaOrigine(richiesta)) {
    return json({ errore: "Origine non consentita." }, 403);
  }

  // ---- entrare
  if (percorso === "/api/auth/richiedi" && metodo === "POST") return richiediLink(richiesta, env, db, url, ora);
  if (percorso === "/api/auth/entra") {
    const c = url.searchParams.get("c");
    if (metodo === "GET") {
      // Il solo aprire il link non spende il codice: i programmi che controllano le email aprono i link prima di te.
      if (!c || c.length > 200) return pagina("Link non valido", `<h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 8px">Link non valido</h1><p style="margin:0">Chiedine uno nuovo dalla mappa.</p>`, 400);
      return pagina(
        "Entra",
        `<h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 8px">Entra su Parimetro</h1><p style="margin:0 0 20px">Un ultimo tocco e sei dentro.</p>
<form method="post" action="/api/auth/entra?c=${encodeURIComponent(c)}">${bottonePieno("Entra")}</form>`,
      );
    }
    if (metodo === "POST") {
      if (!c) return json({ errore: "Link non valido." }, 400);
      const email = await spendiCodice(db, c, ora);
      if (!email) {
        return pagina(
          "Link scaduto",
          `<h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 8px">Il link non vale più</h1><p style="margin:0">Può essere scaduto o già usato. Torna alla mappa e chiedine uno nuovo.</p>`,
          400,
        );
      }
      const uid = await utentePerEmail(db, email, ora);
      const token = await creaSessione(db, uid, ora);
      return new Response(null, {
        status: 303,
        headers: { Location: "/?accesso=ok", "Set-Cookie": cookieSessione(richiesta, token), ...intestazioniBase },
      });
    }
  }
  if (percorso === "/api/auth/esci" && metodo === "POST") {
    const t = leggiCookie(richiesta);
    if (t) await chiudiSessione(db, t);
    return json({ ok: true }, 200, { "Set-Cookie": cookieSessione(richiesta, null) });
  }

  // ---- disiscriversi dagli avvisi (link nelle email)
  if (percorso === "/api/avvisi/disiscrivi") return disiscrivi(richiesta, env, db, url);

  // ---- lo spazio personale
  if (percorso === "/api/me" || percorso.startsWith("/api/me/")) {
    const utente = await utenteDaSessione(db, leggiCookie(richiesta), ora);
    if (percorso === "/api/me" && metodo === "GET") {
      if (!utente) return json({ utente: null });
      return json({
        utente: { email: utente.email },
        comuni: await elencaComuni(db, utente.id),
        card: await elencaCard(db, utente.id),
        domande: await elencaDomande(db, utente.id),
      });
    }
    if (!utente) return json({ errore: "Devi entrare per fare questo." }, 401);
    return spazio(richiesta, db, utente, percorso, metodo, ora);
  }

  return json({ errore: "Non trovato." }, 404);
}

async function richiediLink(richiesta: Request, env: Ambiente, db: D1, url: URL, ora: number): Promise<Response> {
  const corpo = await leggiJson(richiesta);
  const email = normalizzaEmail(corpo?.email);
  if (!email) return json({ errore: "Scrivi un indirizzo email valido." }, 400);

  if (
    (await superaLimite(db, `ip:${await ipImpronta(richiesta)}`, LIMITE_IP_ORA, ora)) ||
    (await superaLimite(db, `email:${(await impronta(email)).slice(0, 24)}`, LIMITE_EMAIL_ORA, ora))
  ) {
    return json({ errore: "Hai chiesto molti link in poco tempo. Riprova tra un'ora." }, 429);
  }
  await pulisci(db, ora);

  const codice = await creaCodiceAccesso(db, email, ora);
  const link = `${url.origin}/api/auth/entra?c=${encodeURIComponent(codice)}`;
  const esito = await inviaEmail(env, messaggioAccesso(email, link, DURATA_CODICE_S / 60));
  if (!esito.ok) {
    console.error("invio email di accesso fallito:", esito.motivo);
    return json({ errore: "Non riesco a mandare l'email in questo momento. Riprova più tardi." }, 503);
  }
  // Stessa risposta se l'indirizzo e' gia' registrato o no: da fuori non si deve poter capire chi ha un account
  return json({ ok: true });
}

async function spazio(richiesta: Request, db: D1, utente: Utente, percorso: string, metodo: string, ora: number): Promise<Response> {
  if (percorso === "/api/me/esporta" && metodo === "GET") {
    return new Response(JSON.stringify(await esportaTutto(db, utente), null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="parimetro-i-miei-dati.json"',
        ...intestazioniBase,
      },
    });
  }
  if (percorso === "/api/me" && metodo === "DELETE") {
    await cancellaUtente(db, utente.id);
    return json({ ok: true }, 200, { "Set-Cookie": cookieSessione(richiesta, null) });
  }

  const corpo = metodo === "GET" ? null : await leggiJson(richiesta);
  const errore400 = json({ errore: "Richiesta non valida." }, 400);

  if (percorso === "/api/me/comuni") {
    if (metodo === "PUT") {
      const nome = nomeComune(corpo?.nome);
      const anno = corpo && annoValido(corpo.anno) ? corpo.anno : null;
      if (!corpo || !istatValido(corpo.istat) || !nome) return errore400;
      const r = await salvaComune(db, utente.id, corpo.istat, nome, anno, ora);
      if (!r.ok) return json({ errore: "Hai già salvato molti comuni: togline qualcuno per aggiungerne altri." }, 409);
      return json({ ok: true, comuni: await elencaComuni(db, utente.id) });
    }
    if (metodo === "DELETE") {
      if (!corpo || !istatValido(corpo.istat)) return errore400;
      await togliComune(db, utente.id, corpo.istat);
      return json({ ok: true, comuni: await elencaComuni(db, utente.id) });
    }
  }
  if (percorso === "/api/me/avviso" && metodo === "PUT") {
    if (!corpo || typeof corpo.attivo !== "boolean") return errore400;
    const istat = corpo.istat == null ? null : istatValido(corpo.istat) ? corpo.istat : undefined;
    if (istat === undefined) return errore400;
    await impostaAvviso(db, utente.id, istat, corpo.attivo);
    return json({ ok: true, comuni: await elencaComuni(db, utente.id) });
  }
  if (percorso === "/api/me/card") {
    if (metodo === "POST") {
      const nome = nomeComune(corpo?.nome);
      if (!corpo || !istatValido(corpo.istat) || !nome || !tipoCardValido(corpo.tipo) || !annoValido(corpo.anno)) return errore400;
      await registraCard(db, utente.id, { istat: corpo.istat, nome, tipo: corpo.tipo, anno: corpo.anno }, ora);
      return json({ ok: true });
    }
    if (metodo === "DELETE") {
      const id = corpo && typeof corpo.id === "number" ? corpo.id : null;
      await eliminaCard(db, utente.id, id);
      return json({ ok: true, card: await elencaCard(db, utente.id) });
    }
  }
  if (percorso === "/api/me/domande") {
    if (metodo === "POST") {
      const t = testoDomanda(corpo?.testo);
      if (!t) return errore400;
      await registraDomanda(db, utente.id, t, ora);
      return json({ ok: true });
    }
    if (metodo === "DELETE") {
      const id = corpo && typeof corpo.id === "number" ? corpo.id : null;
      await eliminaDomande(db, utente.id, id);
      return json({ ok: true, domande: await elencaDomande(db, utente.id) });
    }
  }
  return json({ errore: "Non trovato." }, 404);
}

// ------------------------------------------------------------------ avvisi
export async function linkDisiscrizione(origine: string, uid: string, segreto: string): Promise<string> {
  const f = await firma(`disiscrivi:${uid}`, segreto);
  return `${origine}/api/avvisi/disiscrivi?u=${encodeURIComponent(uid)}&f=${encodeURIComponent(f)}`;
}

async function disiscrivi(richiesta: Request, env: Ambiente, db: D1, url: URL): Promise<Response> {
  const uid = url.searchParams.get("u") ?? "";
  const f = url.searchParams.get("f") ?? "";
  if (!env.SEGRETO_ACCESSO || !uid || !f || !(await firmaValida(`disiscrivi:${uid}`, f, env.SEGRETO_ACCESSO))) {
    return pagina("Link non valido", `<h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 8px">Link non valido</h1><p style="margin:0">Puoi cambiare gli avvisi anche dalla tua area, dopo aver fatto l'accesso.</p>`, 400);
  }
  if (richiesta.method === "POST") {
    await impostaAvviso(db, uid, null, false);
    return pagina("Fatto", `<h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 8px">Non riceverai più avvisi</h1><p style="margin:0">I tuoi comuni restano salvati. Se cambi idea puoi riattivare gli avvisi dalla tua area.</p>`);
  }
  return pagina(
    "Smetti di ricevere avvisi",
    `<h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 8px">Smetti di ricevere avvisi?</h1><p style="margin:0 0 20px">I tuoi comuni restano salvati: non ti scriviamo più quando escono nuovi dati.</p>
<form method="post" action="${esc(url.pathname + url.search)}">${bottonePieno("Sì, smetti")}</form>`,
  );
}

async function inviaAvvisi(richiesta: Request, env: Ambiente, db: D1, url: URL, ora: number): Promise<Response> {
  const auth = richiesta.headers.get("Authorization") ?? "";
  if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) return json({ errore: "Non autorizzato." }, 401);
  if (!env.SEGRETO_ACCESSO) return json({ errore: "SEGRETO_ACCESSO mancante." }, 500);
  const corpo = await leggiJson(richiesta);
  if (!corpo || !annoValido(corpo.anno) || !Array.isArray(corpo.istat) || !corpo.istat.every(istatValido)) {
    return json({ errore: "Servono anno e istat." }, 400);
  }
  const anno = corpo.anno as number;
  const provaSolo = corpo.prova === true;
  const lista = await daAvvisare(db, anno, corpo.istat as string[]);
  let inviati = 0;
  let falliti = 0;
  for (const u of lista) {
    if (provaSolo) continue;
    const novita = u.comuni.map((c) => ({ nome: c.nome, istat: c.istat, anno }));
    const m = messaggioAvviso(u.email, novita, url.origin, await linkDisiscrizione(url.origin, u.utenteId, env.SEGRETO_ACCESSO));
    const e = await inviaEmail(env, m);
    if (e.ok) {
      inviati++;
      await segnaAvvisati(db, u.utenteId, u.comuni.map((c) => c.istat), anno);
    } else {
      falliti++;
    }
  }
  return json({ destinatari: lista.length, inviati, falliti, prova: provaSolo, ora });
}
