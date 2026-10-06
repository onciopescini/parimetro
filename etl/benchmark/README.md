# Banchi di prova a mano

Piccoli insiemi di esempi veri, etichettati a mano da una sola persona, per confrontare metodi (parole chiave,
CPV, modelli di decisione come Laya) **prima** di metterne uno nel sito. Servono a vedere differenze grandi,
non a stimare percentuali precise. Chi vuole migliorarli può aggiungere esempi o correggere le etichette.

| File | Cosa |
|---|---|
| `notizie_etichettate.py`, `confronta_laya.py` | 48 notizie vere: parla dei conti del comune? |
| `lotti_etichettati.json` | 150 lotti ANAC 2023-2025: a quale area di spesa appartengono? **Sviluppo**: le parole chiave sono state scritte guardandolo |
| `lotti_test.json` | 100 lotti mai visti prima di scrivere le parole chiave: **qui** vale il confronto |
| `baseline_lotti.py`, `confronta_lotti.py` | CPV e parole chiave, e lo script che li confronta con Laya |
| `jev.py`, `confronta_jev.py`, `confronta_lotti_jev.py` | Jev (TypeSafe) sugli stessi due banchi di prova; serve `JEV_API_KEY` nel `.env` |

## Risultati (3 ottobre 2026)

Lotti ANAC, 10 aree di spesa, campione mai visto (100 lotti):

| Metodo | Accuratezza | Risponde | Esatto quando risponde |
|---|---|---|---|
| CPV (codice europeo dell'appalto) | 47% | 69% | 64% |
| Parole chiave su oggetto + descrizione CPV | 58% | 70% | 80% |
| Laya multilingue, a freddo | 28% | 67% | 40% |
| **Jev (TypeSafe), a freddo** | **87%** | 99% | 88% (93% se si scartano le risposte sotto 0,5 di confidenza) |

Laya a freddo è molto sotto: sceglie "altro" o "rifiuti" per metà dei lotti, e invertendo l'ordine delle opzioni
il risultato non cambia (27%), quindi non è solo un bias di posizione. Con molti esempi etichettati potrebbe
migliorare affinandolo (`laya` lo prevede): non provato.

Per rifare le prove con Laya serve l'ambiente WSL con PyTorch (su Windows un criterio di sicurezza blocca la
libreria): `~/laya-venv/bin/python etl/benchmark/confronta_lotti.py --laya --file lotti_test.json`.

Classi sbilanciate: "funzionamento" è un quarto, "rifiuti" 6 lotti su 250. I casi dubbi sono segnati (`dubbio`).


## Jev (TypeSafe), 6 ottobre 2026

Stessi esempi, stessi criteri, nessun affinamento. Il modello e' `jev-latest` ("System One": risponde con una scelta e
le probabilita', circa 0,3 s a richiesta, 0,05 $ per milione di token in ingresso).

| Prova | Parole chiave | Jev |
|---|---|---|
| Lotti, campione mai visto (100) | 58% | **87%** (F1 medio 81%) |
| Lotti, campione di sviluppo (150; le parole chiave sono state scritte guardandolo) | 77% | 81-83% |
| Notizie: parla dei conti del comune? (48) | 92% (richiamo 87%) | **94%** (richiamo 96%) |

Sulle notizie la differenza e' di due esempi: non basta per cambiare le regole. Sui lotti invece e' netta e regge su
entrambi gli insiemi. Mettere insieme "parole chiave, poi Jev dove tacciono" **peggiora** (79%): conviene Jev da solo.
Gli sbagli di Jev sono soprattutto lotti ambigui (incarichi tecnici, servizi vari). Come per Laya, le etichette sono di
una persona sola. Non e' ancora usato nel sito: oggi non c'e' nessuna classificazione dei lotti per area di spesa.
Per classificare tutti i lotti nel database (circa 1,25 milioni) servirebbero circa 100 ore in serie o poche ore in parallelo,
e una dozzina di dollari: da decidere prima.
