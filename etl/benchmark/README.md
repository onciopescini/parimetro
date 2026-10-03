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

## Risultati (3 ottobre 2026)

Lotti ANAC, 10 aree di spesa, campione mai visto (100 lotti):

| Metodo | Accuratezza | Risponde | Esatto quando risponde |
|---|---|---|---|
| CPV (codice europeo dell'appalto) | 47% | 69% | 64% |
| Parole chiave su oggetto + descrizione CPV | 58% | 70% | 80% |
| Laya multilingue, a freddo | 28% | 67% | 40% |

Laya a freddo è molto sotto: sceglie "altro" o "rifiuti" per metà dei lotti, e invertendo l'ordine delle opzioni
il risultato non cambia (27%), quindi non è solo un bias di posizione. Con molti esempi etichettati potrebbe
migliorare affinandolo (`laya` lo prevede): non provato.

Per rifare le prove con Laya serve l'ambiente WSL con PyTorch (su Windows un criterio di sicurezza blocca la
libreria): `~/laya-venv/bin/python etl/benchmark/confronta_lotti.py --laya --file lotti_test.json`.

Classi sbilanciate: "funzionamento" è un quarto, "rifiuti" 6 lotti su 250. I casi dubbi sono segnati (`dubbio`).
