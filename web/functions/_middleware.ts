// Il vecchio indirizzo di prova porta al dominio vero (301: i motori di ricerca spostano i link).
// Solo parimetro.pages.dev: le anteprime dei deploy (xxxx.parimetro.pages.dev) restano raggiungibili.
export const onRequest = async (ctx: { request: Request; next: () => Promise<Response> }) => {
  const url = new URL(ctx.request.url);
  if (url.hostname === "parimetro.pages.dev" || url.hostname === "www.parimetro.it") {
    return Response.redirect(`https://parimetro.it${url.pathname}${url.search}`, 301);
  }
  return ctx.next();
};
