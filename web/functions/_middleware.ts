// Il vecchio indirizzo di prova porta al dominio vero (301: i motori di ricerca spostano i link).
// Solo parimetro.pages.dev: le anteprime dei deploy (xxxx.parimetro.pages.dev) restano raggiungibili.
const ANTEPRIMA = /WhatsApp|facebookexternalhit|Facebot|TelegramBot|Twitterbot|Slackbot|LinkedInBot|Discordbot|SkypeUriPreview|Signal|iMessage|Applebot/i;

// Header di sicurezza anche sulle risposte delle Functions (/comune, /comuni, /api, /mcp...): public/_headers vale solo
// per i file statici. Non sovrascrive quelli che una risposta ha gia'.
export const SICUREZZA: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export function conSicurezza(r: Response): Response {
  const out = new Response(r.body, r); // le intestazioni di una risposta ricevuta non si possono modificare: si copia
  for (const [k, v] of Object.entries(SICUREZZA)) if (!out.headers.has(k)) out.headers.set(k, v);
  return out;
}

export const onRequest = async (ctx: { request: Request; next: () => Promise<Response> }) => {
  const url = new URL(ctx.request.url);
  if (url.hostname === "parimetro.pages.dev" || url.hostname === "www.parimetro.it") {
    return Response.redirect(`https://parimetro.it${url.pathname}${url.search}`, 301);
  }
  // La mappa e' su /mappa: i vecchi link /?comune=... (gia' condivisi) vanno li' con gli stessi parametri
  if (url.pathname === "/" && url.search) {
    return Response.redirect(`${url.origin}/mappa${url.search}`, 301);
  }
  // Chi anteprima un link della mappa (WhatsApp, Telegram, Facebook, Slack...) legge la pagina del comune, che ha la sua immagine
  const istat = url.searchParams.get("comune");
  if (url.pathname === "/mappa" && istat && /^\d{6}$/.test(istat) && ANTEPRIMA.test(ctx.request.headers.get("user-agent") ?? "")) {
    return Response.redirect(`${url.origin}/comune/${istat}`, 302);
  }
  return conSicurezza(await ctx.next());
};
