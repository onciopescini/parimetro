"""Due modi semplici di assegnare un lotto ANAC a un'area di spesa, da usare come termine di paragone.

1. `area_da_cpv`: dal codice CPV (il vocabolario europeo degli appalti), che ogni lotto porta con se'.
2. `area_da_parole`: da parole chiave nell'oggetto del lotto e nella descrizione del CPV.

Entrambi possono non sapere: in quel caso rispondono "altro". Meglio tacere che sbagliare.
"""
import re
import unicodedata

AREE = (
    "rifiuti", "strade_trasporti", "istruzione", "sociale_sanita", "ambiente_territorio",
    "cultura_sport_turismo", "utenze", "funzionamento", "patrimonio", "altro",
)

# Il prefisso piu' lungo vince. Fonte dei codici: vocabolario CPV 2008 (divisioni a 2 cifre, gruppi a 3-4).
_CPV = [
    ("09", "utenze"),                    # prodotti petroliferi, carburanti, energia
    ("65", "utenze"),                    # distribuzione di acqua, gas, elettricita'
    ("905", "rifiuti"),                  # rifiuti, smaltimento, raccolta
    ("9061", "strade_trasporti"),        # pulizia delle strade
    ("9091", "funzionamento"),           # pulizia di edifici
    ("90", "ambiente_territorio"),       # fognature, ambiente, bonifiche
    ("77", "ambiente_territorio"),       # verde, silvicoltura
    ("3492", "strade_trasporti"),        # attrezzature stradali
    ("34", "strade_trasporti"),          # mezzi di trasporto
    ("60", "strade_trasporti"),          # servizi di trasporto
    ("4523", "strade_trasporti"),        # strade, autostrade, ponti
    ("45", "patrimonio"),                # lavori di costruzione
    ("50", "patrimonio"),                # riparazione e manutenzione
    ("51", "patrimonio"),                # installazione
    ("9837", "patrimonio"),              # servizi funerari e cimiteriali
    ("98", "altro"),
    ("48", "funzionamento"), ("72", "funzionamento"), ("30", "funzionamento"), ("32", "funzionamento"),
    ("64", "funzionamento"), ("66", "funzionamento"), ("79", "funzionamento"), ("22", "funzionamento"),
    ("85", "sociale_sanita"),
    ("80", "istruzione"),
    ("55524", "istruzione"),             # ristorazione scolastica
    ("92", "cultura_sport_turismo"),
]


def area_da_cpv(cpv: str | None) -> str:
    codice = re.sub(r"\D", "", cpv or "")
    if not codice:
        return "altro"
    for prefisso, area in sorted(_CPV, key=lambda x: -len(x[0])):
        if codice.startswith(prefisso):
            return area
    return "altro"


def _forma(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower())


# L'ordine conta: la prima area che combacia vince
_PAROLE = [
    ("utenze", r"energia elettrica|\bgas\b|gasolio|carburant|riscaldamento|metano|\butenz"),
    ("rifiuti", r"rifiut|raccolta differenziata|igiene urbana|spazzamento|discarica|\btari\b"),
    ("istruzione", r"scuol|scolastic|\bnido\b|\bnidi\b|asilo|mensa|infanzia|istruzione|palestra scolastica"),
    ("sociale_sanita", r"sociale|socio |assistenza domiciliare|minori|disabil|anziani|poverta|accoglienza|sanitar|autonomia"),
    ("cultura_sport_turismo", r"palazzetto|piscina|sportiv|spogliatoi|teatro|museo|bibliotec|turistic|evento|eventi|carnevale|"
                              r"sagre|luminarie|cultura|archeolog|stadio|campo sportivo"),
    ("strade_trasporti", r"strad|marciapied|pubblica illuminazione|illuminazione pubblica|segnaletica|asfalt|parcheggi|"
                         r"viabilita|ciclab|trasporto pubblico|trasporto urbano|ponte"),
    ("ambiente_territorio", r"verde pubblico|alberi|alberatur|potatura|giardin|idrogeolog|frane|fognatur|acquedott|"
                            r"forestazione|bosco|parco|dissesto|torrent|protezione civile"),
    ("funzionamento", r"software|informatic|licenz|\bpc\b|hardware|tesoreria|assicura|polizza|posta|stampa|digital|pnrr 1 4|"
                      r"fotocopiat|telefon|tributi|riscossione|buoni pasto|consulenza"),
    ("patrimonio", r"cimiter|immobil|edific|manutenzione ordinaria|impianti termici|infissi|stabil|sede comunale|municipio"),
]
_COMPILATE = [(a, re.compile(p)) for a, p in _PAROLE]


def area_da_parole(oggetto: str | None, cpv_descr: str | None = None) -> str:
    t = _forma(f"{oggetto or ''} {cpv_descr or ''}")
    for area, rx in _COMPILATE:
        if rx.search(t):
            return area
    return "altro"
