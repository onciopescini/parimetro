// L'invio delle email, dietro un'unica porta: si puo' cambiare fornitore senza toccare il resto.
// Fornitori: Cloudflare Email Service (binding EMAIL, serve il piano Workers a pagamento) oppure Resend
// (RESEND_API_KEY). Senza nessuno dei due, in prova locale (ACCESSO_PROVA=1) il messaggio finisce nel log.

export interface Messaggio {
  a: string;
  oggetto: string;
  testo: string;
  html: string;
}

export interface AmbienteEmail {
  EMAIL?: { send(m: { to: string; from: string; subject: string; text: string; html: string }): Promise<unknown> };
  RESEND_API_KEY?: string;
  /** Indirizzo da cui scriviamo, es. "Parimetro <accesso@parimetro.it>" */
  EMAIL_MITTENTE?: string;
  ACCESSO_PROVA?: string;
}

export const MITTENTE_PREDEFINITO = "Parimetro <accesso@parimetro.it>";

export type EsitoInvio = { ok: true } | { ok: false; motivo: string };

export async function inviaEmail(env: AmbienteEmail, m: Messaggio, log: (s: string) => void = console.log): Promise<EsitoInvio> {
  const from = env.EMAIL_MITTENTE ?? MITTENTE_PREDEFINITO;
  try {
    if (env.RESEND_API_KEY) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [m.a], subject: m.oggetto, text: m.testo, html: m.html }),
      });
      return r.ok ? { ok: true } : { ok: false, motivo: `Resend ${r.status}` };
    }
    if (env.EMAIL) {
      await env.EMAIL.send({ to: m.a, from: from.replace(/^.*<|>$/g, ""), subject: m.oggetto, text: m.testo, html: m.html });
      return { ok: true };
    }
    if (env.ACCESSO_PROVA === "1") {
      log(`[email di prova] a ${m.a}\n${m.oggetto}\n${m.testo}`);
      return { ok: true };
    }
    return { ok: false, motivo: "Nessun fornitore di email configurato" };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "errore sconosciuto" };
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const cornice = (corpo: string) => `<!doctype html><html lang="it"><body style="margin:0;background:#FFF6E5;font-family:Figtree,Arial,sans-serif;color:#1B1A2E">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
<div style="margin-bottom:20px"><span style="display:inline-block;width:44px;height:12px;border-radius:6px;background:#3B3BD6"></span> <span style="display:inline-block;width:26px;height:12px;border-radius:6px;background:#FFD23F"></span> <strong style="font-size:18px;vertical-align:middle">Parimetro</strong></div>
<div style="background:#FFFDF8;border:1px solid #E8DEC8;border-radius:28px;padding:28px">${corpo}</div>
<p style="font-size:13px;color:#5A5873;line-height:1.5;margin:16px 4px">Parimetro mostra i bilanci dei comuni italiani con le fonti. Non pubblichiamo il tuo nome né la tua email.</p>
</div></body></html>`;

const bottone = (url: string, etichetta: string) =>
  `<p style="margin:24px 0"><a href="${esc(url)}" style="display:inline-block;background:#3B3BD6;color:#fff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px">${esc(etichetta)}</a></p>`;

/** Il link per entrare. Vale per poco e funziona una volta sola. */
export function messaggioAccesso(a: string, url: string, minuti: number): Messaggio {
  return {
    a,
    oggetto: "Il tuo link per entrare su Parimetro",
    testo: `Ciao,\n\nper entrare su Parimetro apri questo link (vale ${minuti} minuti e funziona una volta sola):\n\n${url}\n\nSe non l'hai chiesto tu, ignora questa email: non succede niente.\n\nParimetro`,
    html: cornice(
      `<h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 12px">Entra su Parimetro</h1>
<p style="font-size:16px;line-height:1.5;margin:0">Tocca il pulsante per entrare. Il link vale ${minuti} minuti e funziona una volta sola.</p>${bottone(url, "Entra")}
<p style="font-size:14px;color:#5A5873;line-height:1.5;margin:0">Se non l'hai chiesto tu, ignora questa email: non succede niente.</p>`,
    ),
  };
}

export interface NovitaComune {
  nome: string;
  istat: string;
  anno: number;
}

/** L'avviso: e' uscito un nuovo bilancio per uno o piu' comuni salvati. Contiene sempre il modo di non riceverne piu'. */
export function messaggioAvviso(a: string, comuni: NovitaComune[], origine: string, urlDisiscrizione: string): Messaggio {
  const righe = comuni.map((c) => `• ${c.nome}: dati di cassa ${c.anno} — ${origine}/comune/${c.istat}`);
  const uno = comuni.length === 1;
  return {
    a,
    oggetto: uno ? `Nuovi dati per ${comuni[0].nome}` : `Nuovi dati per ${comuni.length} dei tuoi comuni`,
    testo: `Ciao,\n\n${uno ? "è uscito un nuovo anno di dati per un comune che hai salvato" : "sono usciti nuovi dati per comuni che hai salvato"}:\n\n${righe.join("\n")}\n\nSono dati di cassa (incassi e pagamenti), con la fonte indicata nella scheda.\n\nNon vuoi più ricevere avvisi? ${urlDisiscrizione}\n\nParimetro`,
    html: cornice(
      `<h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 12px">Nuovi dati sui tuoi comuni</h1>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px">${uno ? "È uscito un nuovo anno di dati per un comune che hai salvato." : "Sono usciti nuovi dati per comuni che hai salvato."}</p>
<ul style="padding-left:20px;margin:0 0 8px;line-height:1.7;font-size:16px">${comuni
        .map((c) => `<li><a href="${esc(`${origine}/comune/${c.istat}`)}" style="color:#3B3BD6;font-weight:700">${esc(c.nome)}</a> · dati di cassa ${c.anno}</li>`)
        .join("")}</ul>
<p style="font-size:14px;color:#5A5873;line-height:1.5;margin:16px 0 0">Non vuoi più ricevere avvisi? <a href="${esc(urlDisiscrizione)}" style="color:#3B3BD6">Smetti di riceverli</a>.</p>`,
    ),
  };
}
