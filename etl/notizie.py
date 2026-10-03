"""Notizie sui conti dei comuni: quali risultati di una ricerca valgono e come si leggono.

Qui c'e' solo logica pura (nessuna rete, nessun database), cosi' si prova con dei test.
Si tengono SOLO titolo, fonte, data e link: niente testo dell'articolo, niente riassunti.
La scelta di cosa sia "pertinente" la fa il codice con parole chiave, non un modello.
"""
import re
import unicodedata
from datetime import date, datetime, timedelta
from urllib.parse import urlparse

# Quanto indietro si guarda
MESI_MASSIMI = 18

# Siti che non sono testate: non hanno una "fonte" da citare
HOST_ESCLUSI = {
    "facebook.com", "m.facebook.com", "twitter.com", "x.com", "instagram.com", "tiktok.com", "youtube.com",
    "linkedin.com", "pinterest.com", "reddit.com", "t.me", "wikipedia.org", "it.wikipedia.org",
}


def forma(s: str) -> str:
    """Senza accenti, minuscolo, ogni segno ridotto a uno spazio: "Sant'Agata" -> "sant agata"."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


# Modi di dire in cui "bilancio" vuol dire "resoconto" e non conti pubblici ("traccia un bilancio del Natale")
IDIOMI = re.compile(
    r"commissione bilancio|trace?\w* (un |il )?bilancio|tirare? (un |il )?bilancio|bilancio (positivo|negativo|"
    r"della stagione|delle festivita|del natale|dell estate|turistic\w*|delle presenze)|bilancio di (un|una) "
    r"(stagione|anno|estate|mandato)|bilancio dell incidente|bilancio (dei|delle) (feriti|vittime)|"
    r"bilancio (di )?(sostenibilita|sociale|ambientale|di genere|di mandato)"
)

# Parole che indicano conti, tributi, appalti o fondi pubblici del comune
PERTINENTI = re.compile(
    r"\brendiconto|\bbilancio (di previsione|consolidato|comunale|partecipativo|pluriennale|approvat\w*)|"
    r"\bvariazion\w* (di|al|del) bilancio|\bapprov\w* (il |lo )?(bilancio|rendiconto)|\bdissest|\bpredissest|"
    r"\briequilibrio finanziario|\bdisavanzo|\bavanzo (di|di amministrazione)|\b(imu|tari|tasi|irpef)\b|"
    r"\baddizionale (comunale|irpef)|\btribut|\bdebit[oi]\b|\bappalt|\bgara d appalto|\bgare\b|\baffidament|"
    r"\bpnrr\b|\bfondi europei|\bfinanziament|\bopere pubbliche|\brevisor\w* dei conti|\bcorte dei conti|"
    r"\bconti (pubblici|del comune|in rosso)|\bmutu[oi]\b|\bcassa comunale|\bcontributi (statali|regionali)|"
    r"\bassestament\w*|\bmanovra\b|\bbilancio 20\d\d|\bstanziat\w+|\bavanzo\b|"
    r"\bbilancio\b[^.]{0,80}\b(milion\w*|mld|miliard\w*)\b|\b(milion\w*|mld|miliard\w*)\b[^.]{0,80}\bbilancio\b"
)


def pertinente(titolo: str, snippet: str | None = None) -> bool:
    """Parla di conti, tributi, appalti o fondi? Si guarda il titolo e, se c'e', il breve estratto."""
    t = IDIOMI.sub(" ", forma(f"{titolo} {snippet or ''}"))
    return bool(PERTINENTI.search(t))


def cita_il_comune(titolo: str, snippet: str | None, nome: str, provincia: str | None, ambiguo: bool) -> bool:
    """Il comune e' nominato? Per i nomi che hanno piu' omonimi serve anche la provincia."""
    t = f" {forma(f'{titolo} {snippet or chr(32)}')} "
    nomi = {forma(p) for p in nome.split("/")} | {forma(nome)}
    nomi |= {re.sub(r"^(il|lo|la|l|i|gli|le) ", "", n) for n in nomi}
    if not any(f" {n} " in t for n in nomi if len(n) >= 3):
        return False
    if ambiguo and provincia:
        return f" {forma(provincia)} " in t
    return True


def fonte(url: str) -> str | None:
    """Il sito della testata, senza "www.": e' la fonte che si mostra."""
    try:
        h = (urlparse(url).hostname or "").lower()
    except ValueError:
        return None
    h = h[4:] if h.startswith("www.") else h
    return h or None


def escluso(url: str) -> bool:
    h = fonte(url)
    return h is None or h in HOST_ESCLUSI or any(h.endswith("." + x) for x in HOST_ESCLUSI)


_RELATIVA = re.compile(r"(\d+)\s*(minut|min|ore|ora|hour|giorn|day|settiman|week|mes|month)", re.I)


def leggi_data(testo: str | None, oggi: date | None = None) -> date | None:
    """Le date arrivano come "10 Jun 2026" o "3 days ago". Se non si capisce: None (e la notizia si scarta)."""
    if not testo:
        return None
    oggi = oggi or date.today()
    testo = re.sub(r"\bSept\b", "Sep", testo.strip())  # "23 Sept 2025"
    for fmt in ("%d %b %Y", "%b %d, %Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(testo, fmt).date()
        except ValueError:
            pass
    m = _RELATIVA.search(testo)
    if m and re.search(r"ago|fa\b", testo, re.I):
        n, unita = int(m.group(1)), m.group(2).lower()
        giorni = (
            0 if unita.startswith(("min", "ore", "ora", "hour")) else
            n if unita.startswith(("giorn", "day")) else
            7 * n if unita.startswith(("settiman", "week")) else 30 * n
        )
        return oggi - timedelta(days=giorni)
    return None


def recente(d: date, oggi: date | None = None) -> bool:
    oggi = oggi or date.today()
    return oggi - timedelta(days=30 * MESI_MASSIMI) <= d <= oggi + timedelta(days=1)


# Una ricerca per tema. La ricerca di notizie restituisce ZERO risultati con le virgolette e anche con tre
# parole chiave insieme (verificato il 3 ottobre 2026); "Comune di X bilancio" e "Comune di X appalti"
# funzionano. Il controllo che il comune sia davvero nominato lo fa poi cita_il_comune().
TEMI = ("bilancio", "appalti")


def interrogazioni(nome: str, provincia: str | None, ambiguo: bool) -> list[str]:
    """I testi da cercare, uno per tema. Per i nomi con omonimi si aggiunge la provincia."""
    base = f"Comune di {nome.split('/')[0]}" + (f" {provincia}" if ambiguo and provincia else "")
    return [f"{base} {tema}" for tema in TEMI]


def seleziona(risultati: list[dict], nome: str, provincia: str | None, ambiguo: bool,
              oggi: date | None = None, massimo: int = 8) -> list[dict]:
    """Dai risultati grezzi di una ricerca alle notizie da tenere: titolo, fonte, data, link. Nient'altro."""
    viste: set[str] = set()
    tenute = []
    for r in risultati:
        url, titolo = r.get("url"), (r.get("title") or "").strip()
        if not url or not titolo or url in viste or escluso(url):
            continue
        viste.add(url)
        d = leggi_data(r.get("date"), oggi)
        snippet = r.get("snippet") or r.get("description")
        if d is None or not recente(d, oggi):
            continue
        if not cita_il_comune(titolo, snippet, nome, provincia, ambiguo) or not pertinente(titolo, snippet):
            continue
        tenute.append({"url": url, "titolo": titolo[:300], "fonte": fonte(url), "data": d})
    tenute.sort(key=lambda x: x["data"], reverse=True)
    return tenute[:massimo]
