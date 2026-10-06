"""Un piccolo client per Jev (TypeSafe, "System One"): domande a scelta chiusa che tornano con le probabilita'.

La chiave sta in JEV_API_KEY nel .env (mai nel codice). Provata prima sull'indirizzo di TypeSafe e, se la chiave non
vale li' (401/403), su quello di OpenRouter, dove Jev e' offerto con la stessa forma di richiesta.
"""
import json
import os
import time
import urllib.error
import urllib.request

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

INDIRIZZI = ("https://api.typesafe.ai/v1/systemone", "https://openrouter.ai/api/v1/systemone")
_scelto: str | None = None


def chiedi(stato: str, domande: dict, modello: str = "jev-latest", tentativi: int = 4) -> dict:
    """Manda lo stato e le domande; restituisce il blocco "answers". Solleva l'ultimo errore se non riesce."""
    global _scelto
    chiave = os.environ.get("JEV_API_KEY")
    if not chiave:
        raise SystemExit("JEV_API_KEY mancante nel .env")
    corpo = json.dumps({"state": stato, "model": modello, "questions": domande}).encode()
    candidati = (_scelto,) if _scelto else INDIRIZZI
    ultimo: Exception | None = None
    for url in candidati:
        for t in range(tentativi):
            req = urllib.request.Request(
                url, data=corpo, headers={"Authorization": f"Bearer {chiave}", "Content-Type": "application/json"}
            )
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    out = json.load(r)
                _scelto = url
                return out["answers"]
            except urllib.error.HTTPError as e:
                ultimo = e
                if e.code in (401, 403, 404):  # chiave o indirizzo sbagliato: si passa al prossimo
                    break
                time.sleep(3 * (t + 1) if e.code == 429 else 1 + t)
            except (urllib.error.URLError, TimeoutError) as e:
                ultimo = e
                time.sleep(1 + t)
    raise RuntimeError(f"Jev non risponde: {ultimo}")
