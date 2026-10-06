# Accesso facoltativo

Si usa tutto senza entrare. Chi vuole può entrare con la sola email (nessuna password): un link di accesso, valido 15
minuti e utilizzabile una volta sola. Entrando si possono salvare comuni, ricevere un avviso quando esce un nuovo anno di
dati, ritrovare l'elenco delle card create e delle domande fatte alla chat. Tutto si scarica e si cancella dall'interfaccia.

## Come e' fatto

- **Archivio**: Cloudflare D1 (SQLite), binding `DB`, schema in `web/migrations/`. Si applica con
  `npx wrangler d1 migrations apply parimetro --remote`.
- **Codice**: `web/lib/account/` (logica pura, provata con un SQLite vero in `tests/account.test.ts`), le rotte
  in `web/functions/api/{auth,me,avvisi}`, l'interfaccia in `web/components/account/`.
- **Sicurezza**: codici di accesso e sessioni salvati solo come impronta SHA-256; il link nell'email apre una pagina
  con un pulsante (aprire il link non lo spende, cosi' non lo consumano i programmi che controllano le email); cookie
  `HttpOnly`, `Secure`, `SameSite=Lax`; le richieste che cambiano qualcosa devono arrivare dallo stesso sito; limiti
  di richieste per email e per indirizzo; risposta identica per email nuova o gia' registrata.
- **Cosa si conserva**: email, comuni salvati, elenco delle card (comune/tipo/anno, non l'immagine), domande alla chat
  fatte da dentro. Descrizione per gli utenti: la pagina `/privacy`.

## Attivarlo (una volta)

L'interfaccia compare solo se il sito ha un database **e** un modo di mandare le email; altrimenti resta nascosta.

1. Database: gia' creato (`parimetro`) e legato in `web/wrangler.toml`.
2. Segreti sul progetto Pages (`npx wrangler pages secret put NOME --project-name parimetro`):
   `SEGRETO_ACCESSO` (firma i link di disiscrizione) e `ADMIN_TOKEN` (fa partire gli avvisi): gia' impostati.
3. **Un fornitore di email**, uno dei due:
   - **Cloudflare Email Service**: richiede il piano *Workers a pagamento* (5 $/mese; 3.000 email/mese incluse, poi
     0,35 $ ogni 1.000) e la verifica del dominio nel pannello (Email → Email Sending). Poi si aggiunge a `wrangler.toml`
     `[[send_email]]` con `name = "EMAIL"` e si ripubblica.
   - **Resend** (gratis fino a 3.000 email/mese): account su resend.com, si verifica `parimetro.it` aggiungendo i record
     DNS che indica, e `npx wrangler pages secret put RESEND_API_KEY --project-name parimetro`.
   Il mittente predefinito e' `Parimetro <accesso@parimetro.it>` (si cambia con la variabile `EMAIL_MITTENTE`).

## Gli avvisi sui nuovi bilanci

Dopo aver importato e pubblicato un nuovo anno di dati:

```bash
cd etl
python 12_invia_avvisi.py --anno 2025            # prova: quante persone riceverebbero un avviso
python 12_invia_avvisi.py --anno 2025 --invia    # scrive davvero (una email a persona, senza doppioni)
```

Chi salva un comune parte gia' "al corrente" dell'ultimo anno visto: l'avviso scatta solo per anni successivi.

## Provarlo in locale

```bash
cd web
npx wrangler d1 migrations apply parimetro --local
npx wrangler pages dev out --binding ACCESSO_PROVA=1 --binding SEGRETO_ACCESSO=x --binding ADMIN_TOKEN=y
```

Con `ACCESSO_PROVA=1` le email non partono: il link di accesso compare nel log del server.
