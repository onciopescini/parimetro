# Deploy · parimetro su Cloudflare Pages

## Come si pubblica

Il progetto Pages `parimetro` è a **caricamento diretto**: non è collegato a
GitHub, quindi un push su `main` non pubblica niente. Si pubblica a mano, da
una macchina che ha il database:

```bash
./selfhost/pubblica.sh               # export dei dati veri + build + deploy
./selfhost/pubblica.sh --solo-build  # se web/public/dati è già aggiornato
```

Oppure, con `web/public/dati` già esportato:

```bash
cd web
npm run build          # out/ è la cartella di pubblicazione
npx wrangler pages deploy out --project-name parimetro --branch main
```

## Perché la CI non pubblica

I dati del sito (`web/public/dati`, migliaia di JSON) non sono nel repository:
li produce `etl/05_esporta_statico.py` dal database. In CI il database non c'è,
quindi la build della CI usa le fixture di `npm run fixture` (7 comuni
inventati). Quella build serve a controllare che il sito compili: **se
venisse pubblicata, sostituirebbe il sito vero con i comuni finti.** Per
questo la CI non ha un job di deploy e non servono segreti Cloudflare su
GitHub.

Prima di pubblicare a mano, controllare che `web/public/dati` contenga i dati
veri e non le fixture: `npm run fixture` cancella la cartella e ci scrive i
comuni finti (codici 99000x).

## Note

- Il token OAuth di wrangler del computer locale **non** va copiato altrove.
- `web/public/_headers` viene copiato in `out/` dalla build: sono gli header
  (cache e sicurezza) che Cloudflare applica ai file statici.
- `web/public/_routes.json` dice a Cloudflare quali richieste passano dalle
  Functions. Gli asset (`/_next/*`, `/dati/*`, font, immagini) sono esclusi:
  così non consumano la quota giornaliera delle Functions (100.000 sul piano
  gratuito). Una nuova cartella di file statici in `public/` va aggiunta lì
  agli `exclude`.
- Il database dell'officina si salva con `selfhost/backup.sh` (dump locale +
  copia su Cloudflare R2): vedi `selfhost/README.md`, sezione Backup.
