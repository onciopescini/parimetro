# Far conoscere Parimetro a un gruppo piccolo

Scopo: non "fare numeri", ma capire **se qualcuno lo usa e a cosa gli serve**. Con la risposta di 10-20 persone giuste si decide tutto il
resto (cosa costruire, se chiedere sostegno, se vale la pena l'MCP). Niente è stato inviato a nessuno: questo è solo il materiale.

## A chi

Un gruppo di poche decine di persone, non un lancio pubblico:

- **Giornalisti e redazioni locali**, soprattutto chi fa giornalismo dei dati o scrive di bilanci, appalti, PNRR.
- **Associazioni civiche** che seguono la trasparenza (monitoraggio civico, open data).
- **Ricercatori e studenti** di economia pubblica, scienze politiche, statistica.
- **Qualche amministratore o dipendente comunale**, di comuni piccoli e grandi, per vedere come si legge dalla loro parte.
- **Consulenti e studi** che lavorano con i comuni.

Non scelgo io i nomi: li scegli tu, e l'invio resta a te.

## Cosa si dice (bozza, 5 righe)

> Ho costruito Parimetro (parimetro.it), una mappa dei bilanci di tutti i comuni italiani, con la spesa per voce, i confronti con i comuni
> della stessa dimensione, il PNRR, gli appalti e il reddito. Dati aperti, con le fonti su ogni numero; sono dati di cassa, non di competenza.
> Mi serve il parere di chi lavora con questi dati: cosa manca, cosa non torna, cosa usereste. Le pagine dei comuni si possono citare e le
> card sono scaricabili. Bastano cinque minuti e una risposta a questa email.

Allegare: il link al comune di chi legge (la persona vede subito "il suo"), e come citare: `Parimetro, dati SIOPE (cassa) <anno>, <link>, consultato il <data>`.

## Cosa chiedere (tre domande, non di più)

1. Hai trovato il tuo comune (o quello che segui) in meno di un minuto? Cosa ti è sembrato poco chiaro?
2. C'è un numero che non ti torna o che non ti fideresti a citare? Perché?
3. Se potessi chiedere una sola cosa in più, quale?

## Come leggere i numeri (da dare a chi scrive)

La nota più importante per chi scrive di appalti:

- **Anno 2024:** ANAC ha cambiato la rilevazione. Gli affidamenti diretti sono ~92% dei lotti (mediana dei comuni con almeno 50 lotti) perché
  entrano anche i micro-affidamenti: non è un dato anomalo, e **non è confrontabile con gli anni prima**. Il confronto valido è tra
  comuni dello stesso anno.
- **Dati di cassa:** incassi e pagamenti, non accertamenti e impegni. "Avanzo" è saldo di cassa.
- **Classificazioni dei lotti** (a cosa servono le gare, tipo di intervento): automatiche, non un dato ANAC; possono sbagliare.
- **Un comune con una sola voce enorme** (un investimento isolato) ha il pro capite non confrontabile: la scheda lo segnala.

## Spunti verificabili (per stimolare, non per accusare)

Calcolati sui dati del 7 ottobre 2026. Sono domande da cui partire, non conclusioni.

1. **Dove si fanno meno affidamenti diretti nei grandi comuni (2024)?** Tra i comuni sopra i 60.000 abitanti con almeno 100 lotti, il valore più basso è
   Torino (51%), poi Quartu Sant'Elena (57%), Genova (62%), Milano (63%), Bari (64%). Il più alto: Cremona (96%), Cesena (96%), Pomezia (95%).
   *Come leggerlo:* dipende anche da cosa il comune pubblica come lotto e da quanti micro-affidamenti registra; chiedere al comune prima di concludere.
2. **Differenze tra regioni.** La mediana della quota di affidamenti diretti nel 2024 va dal 96% della Valle d'Aosta e dal 94% di Trentino-Alto Adige e
   Friuli-Venezia Giulia fino all'84% della Basilicata e all'87-88% di Sardegna e Campania (solo comuni con almeno 50 lotti, regioni con almeno 20 comuni).
3. **A cosa servono le gare del 2024 in Italia** (classificazione automatica, lotti classificati): funzionamento 22,5%, strade e trasporti 15%, cultura e sport 12%,
   ambiente 12%, immobili 12%, scuole 9%, utenze 7%, sociale 7%, rifiuti 3% (sui lotti con un'area assegnata, escluso "altro").
4. Le classifiche del sito permettono di cercare comuni con più PNRR per abitante, più reddito medio dei residenti, più autonomia finanziaria: ogni risultato è
   un file scaricabile.

## Come raccogliere le risposte

- Per ora una casella email dedicata (da creare) o le segnalazioni su GitHub: nessuno strumento di tracciamento.
- Annotare in un foglio: chi, ruolo, cosa ha trovato, cosa non torna, cosa chiede. Dopo 15 risposte si leggono insieme.
- **Misura minima dell'uso** (facoltativa, tua scelta): un contatore senza cookie (per esempio quello di Cloudflare) dice solo quante visite arrivano
  e a quali pagine, senza identificare nessuno. Serve a capire se il lancio ha mosso qualcosa.

## Cosa vogliamo imparare (e come decidiamo)

| Se... | allora... |
|---|---|
| in tanti trovano subito il comune e lo citano | si cura la pagina del comune e le card; si valuta un servizio per le redazioni |
| chiedono i dati in blocco o via assistenti AI | l'MCP e l'API diventano prioritari |
| segnalano numeri che non tornano | si corregge il metodo prima di tutto il resto |
| nessuno risponde o non lo usa | si cambia il racconto (o il progetto) prima di spendere altro |

## Prima di scrivere a chiunque

- Completare `/privacy` con titolare e contatto e far rivedere i testi (documento di revisione tenuto fuori dal repo).
- Parole delle classifiche: "Valori più alti" / "Valori più bassi" (decisione presa).
- Finire la classificazione 2024 se vuoi mostrare "Che cosa si compra" (richiede la ricarica di Jev).
