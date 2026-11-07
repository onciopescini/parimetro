# Deploy · parimetro su Cloudflare Pages

## Stato (7 novembre 2026)

Il progetto Pages `parimetro` attuale è a **caricamento diretto** (non collegato
a GitHub), quindi i push su `main` non pubblicano nulla da soli. La CI ora
implementa un job `deploy` che, dopo web + ETL verdi, ricostruisce l'output
statico e lo pubblica con `wrangler pages deploy`. **Serve un segreto una sola
volta.**

## Configurazione una sola volta (5 minuti, da fare solo tu)

1. **Token API Cloudflare**
   Vai su <https://dash.cloudflare.com/profile/api-tokens> → *Crea token* →
   modello **"Modifica Cloudflare Workers"**, poi aggiungi il permesso
   **Account → Cloudflare Pages → Edit** (il modello Workers da solo non
   copre Pages). Account = *Alfonso@pescini.org's Account*. Copia il token.
2. **Segreti GitHub** (nel repo `onciopescini/parimetro`):
   ```bash
   gh secret set CLOUDFLARE_API_TOKEN    # incolla il token
   gh secret set CLOUDFLARE_ACCOUNT_ID   # 9f40d273cb3661c6bc666381b292ad94
   ```
   (o da web GitHub → Settings → Secrets and variables → Actions.)

Dalla spinta successiva la CI esegue anche il deploy, che appare come job
"Deploy on Cloudflare Pages". Finché i segreti mancano, quel job gira a vuoto
con un avviso, senza rossore.

## CLI a mano (uguale a quello che fa la CI)

```bash
cd web
npm run build          # out/ è la cartella di pubblicazione
npx wrangler pages deploy out --project-name parimetro --branch main
```

## Note

- Il token OAuth wrangler del computer locale **non** va copiato in giro:
  in CI si usa un Token API con le autorizzazioni minime.
- `web/public/_headers` viene copiato in `out/` dalla build ed è ciò che
  Cloudflare applica (cache + header di sicurezza): lo hai visto attivo
  in produzione dopo il deploy manuale del 7/11/2026.
- Se un giorno il progetto si sposta sul collegamento GitHub nativo, questo
  job Deploy va tolto (farebbe un doppio deploy).
