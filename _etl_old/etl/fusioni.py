"""Comuni nati da fusioni: si ricostruisce la serie "a confini attuali".

SIOPE registra gli enti col codice del loro tempo: prima della fusione ci sono i
comuni vecchi (che l'anagrafica ISTAT 2025 non ha piu'), dopo c'e' quello nuovo.
Senza questa tabella il comune nuovo risulterebbe senza storico, e i vecchi
sarebbero dati caricati e buttati. Si sommano i predecessori al successore, anno
per anno: un predecessore compare in SIOPE solo prima della fusione, mai insieme
al nuovo codice, quindi non si conta due volte.

La tabella e' scritta a mano, ricavata dai codici SIOPE senza corrispondenza in
anagrafica (nomi ed enti verificati contro i file 2020-2024) e dai nomi nei file POSAS.
Non e' estratta in automatico: una fusione sbagliata sposterebbe soldi fra comuni.

pop_dal: primo anno in cui la popolazione ISTAT (POSAS, al 1 gennaio) riporta gia' il
comune fuso. Prima, la popolazione e' la somma delle parti; dopo, e' quella del
comune. Per i comuni che POSAS non ha ancora (fusioni 2024-2025) vale sempre la somma.

NON coperti: Misiliscemi (081025, nato nel 2021 da una parte di Trapani: i dati prima
non si possono dividere) e Caines/Kuens (021014, assente da SIOPE).
"""
from collections import defaultdict

# nuovo codice -> (predecessori col vecchio codice, pop_dal)
FUSIONI: dict[str, tuple[list[str], int]] = {
    "005122": (["005079", "005110"], 2023),            # Moransengo + Tonengo
    "012144": (["012009", "012018", "012095"], 2023),  # Bardello + Malgesso + Bregano
    "013256": (["013199", "013228"], 2099),            # Ronago + Uggiate-Trevano
    # Campospinoso ha tenuto il proprio codice e ha assorbito Albaredo Arnaboldi:
    # il predecessore da sommare e' solo quest'ultimo
    "018026": (["018002"], 2024),
    "024128": (["024044", "024103"], 2099),            # Gambugliano + Sovizzo
    "025075": (["025002", "025070"], 2099),            # Alano di Piave + Quero Vas
    "028108": (["028022", "028098"], 2099),            # Carceri + Vighizzolo d'Este
}

_NUOVO_DI = {vecchio: nuovo for nuovo, (vecchi, _) in FUSIONI.items() for vecchio in vecchi}


def rimappa(codice: str) -> str:
    """Il codice del comune di oggi per un codice SIOPE di ieri."""
    return _NUOVO_DI.get(codice, codice)


def fondi(per_comune: dict) -> dict:
    """Somma, comune per comune, i dizionari di importi dei predecessori nel successore.

    Va chiamata DOPO aver ridotto ogni comune al suo ultimo mese: un predecessore che
    ha trasmesso meno mesi dell'altro non deve accorciare l'anno di quello nuovo.
    """
    out: dict = {}
    for codice, importi in per_comune.items():
        acc = out.setdefault(rimappa(codice), defaultdict(float))
        for chiave, valore in importi.items():
            acc[chiave] += valore
    return out


def popolazione_fusa(codice: str, anno: int, pop_anno: dict) -> int | None:
    """Popolazione di un comune nato da fusione; None se non e' un comune fuso."""
    if codice not in FUSIONI:
        return None
    vecchi, pop_dal = FUSIONI[codice]
    propria = pop_anno.get(codice, 0)
    if anno >= pop_dal:
        return propria or None
    return (propria + sum(pop_anno.get(v, 0) for v in vecchi)) or None
