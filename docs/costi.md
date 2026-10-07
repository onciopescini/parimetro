# Quanto costa Parimetro

Il sito e' statico e quasi tutto e' gratis. Le uniche spese che crescono con l'uso sono le domande alla chat; il resto sono
spese una tantum per ogni nuovo anno di dati. Cifre in dollari, **stime** da calibrare sull'uso reale (console di ciascun servizio).

| Voce | Chi | Quando | Costo |
|---|---|---|---|
| Sito, pagine dei comuni, funzioni | Cloudflare Pages (gratis, tetto 100.000 richieste di funzioni al giorno) | sempre | 0 (oltre: Workers a pagamento, 5 $/mese) |
| Archivio degli account | Cloudflare D1 | sempre | 0 nei limiti gratuiti |
| Email di accesso e avvisi | Resend (gratis fino a 3.000 al mese) | sempre | 0 |
| Dominio parimetro.it | registrar | ogni anno | circa 12 euro + IVA |
| **Una domanda alla chat** | Jev (TypeSafe), prepagato | a ogni domanda nuova | circa 900 token = 0,00005 $ (1.000 domande = 5 centesimi) |
| Testo della risposta (facoltativo) | OpenRouter, modelli economici | a ogni domanda | circa 1 centesimo ogni 100 domande |
| Classificare i lotti di un anno (area, intervento) | Jev | una volta per anno di dati | circa 5-10 $ per ~340.000 lotti |
| Notizie sui comuni | Firecrawl (1.000 crediti al mese gratis) | a rotazione | 0-poche decine di $ |

## Come si tiene sotto controllo la chat

- **Cache di 24 ore:** la stessa domanda (stesso testo) si paga una sola volta. In memoria non resta nessuna domanda, solo un'impronta.
- **Tetto giornaliero:** `JEV_MAX_GIORNO` chiamate a Jev al giorno (predefinito 3.000, circa 0,15 $). Poi la chat torna al modo di prima,
  senza Jev. Il contatore e' nel database (tabella `tetto_giornaliero`); se non risponde, Jev resta spento.
- **Crediti finiti o chiave non valida** (402, 401, 403): Jev si sospende per 10 minuti e la chat usa il modo di prima.
- **Limite per indirizzo:** 15 domande all'ora, gia' presente.
- **Pagamento prepagato:** si ricarica una cifra piccola con la ricarica automatica spenta, cosi' la spesa massima e' decisa in anticipo.

## Come si copre

Principi: i dati restano aperti (CC BY-SA) e il codice libero (MIT); niente pubblicita', niente vendita di email o domande, niente muro
a pagamento sulla mappa. Strade compatibili: sostegno volontario con questa pagina come trasparenza; servizi per chi ci lavora
(schede comparative, avvisi per redazioni, API con garanzie); fondi e sponsor con regole di indipendenza.
