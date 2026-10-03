"""Collegare un progetto PNRR a un comune.

Il dataset PNRR di Italia Domani NON ha una colonna con il comune: indica solo il soggetto
attuatore (denominazione e codice fiscale/partita IVA). Qui si risale al comune quando il
soggetto attuatore E' il comune ("COMUNE DI LAURITO"):

  1. dal codice fiscale, tramite l'anagrafica IPA (Indice PA);
  2. se non basta, dal NOME, ma solo se nessun altro comune si chiama uguale.

Il passo 2 serve perche' IPA riporta il codice fiscale del comune (es. 84001510654) mentre il
PNRR usa la partita IVA (00776010654): meta' dei comuni non si aggancia col codice.

Non si indovina mai: due comuni con lo stesso nome (due "Castro") restano senza comune. Un
progetto di RFI, di un ministero o di una Regione nemmeno ha un comune: non e' un buco da
riempire, e' un dato che il PNRR non pubblica.
"""
import re
import unicodedata

# "COMUNE DI X", "Comune d'X", "COMUNE DELLA SPEZIA", "Città di X"
_PREFISSO = re.compile(
    r"^\s*(?:comune|citt(?:[aàá]|a['’])|municipio)\s+(?:di\s+|d['’]\s*|del\s+|dello\s+|della\s+|dei\s+|degli\s+|delle\s+|dell['’]\s*)?(.+?)\s*$",
    re.IGNORECASE,
)
# Qualcuno scrive "COMUNE DI CASTRO (BG)" o "COMUNE DI X - UFFICIO Y"
_CODA_SIGLA = re.compile(r"\s*\(([A-Za-z]{2})\)\s*$")


def forma(s: str) -> str:
    """Senza accenti, minuscolo, ogni segno ridotto a uno spazio: "Sant'Agata" -> "sant agata"."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


# Nomi che il dataset usa e che l'anagrafica ISTAT 2025 non ha: comuni poi fusi (vedi fusioni.py)
# e qualche variante di grafia. Chiave = forma() del nome, valore = codice ISTAT di oggi.
ALIAS_NOMI: dict[str, str] = {
    # fusioni: i vecchi comuni al comune di oggi
    "moransengo": "005122", "tonengo": "005122",
    "bardello": "012144", "bregano": "012144", "malgesso": "012144",
    "ronago": "013256", "uggiate trevano": "013256",
    "albaredo arnaboldi": "018026",
    "gambugliano": "024128", "sovizzo": "024128",
    "alano di piave": "025075", "quero vas": "025075",
    "carceri": "028108", "vighizzolo d este": "028108",
    # grafie diverse da quella ISTAT
    "cassano allo ionio": "078029",
    "poiana maggiore": "024079",
}

# Denominazioni che sono il comune ma non hanno la forma "Comune di X". Chiave = forma().
ALIAS_DENOMINAZIONI: dict[str, str] = {
    "roma capitale": "058091",
}

# Quando l'apostrofo e' un accento che forma() cancella e il nome diventa ambiguo:
# Paterno' (Catania) e Paterno (Potenza). Chiave = denominazione maiuscola, cosi' com'e' nel file.
ALIAS_ACCENTATI: dict[str, str] = {
    "COMUNE DI PATERNO'": "087033",
}

# Il dataset PNRR tronca la denominazione a 40 caratteri ("COMUNE DI " + 30): sotto questa
# lunghezza un nome e' intero, da qui in su puo' essere un prefisso
LUNGHEZZA_TRONCAMENTO = 28


def nome_comune_da_attuatore(denominazione: str | None) -> tuple[str, str | None] | None:
    """("COMUNE DI CASTRO (BG)") -> ("castro", "BG"). None se non e' un comune."""
    # pandas legge le celle vuote come float NaN: tutto cio' che non e' testo e' "assente"
    if not isinstance(denominazione, str) or not denominazione.strip():
        return None
    m = _PREFISSO.match(denominazione)
    if not m:
        return None
    resto = m.group(1)
    sigla = None
    s = _CODA_SIGLA.search(resto)
    if s:
        sigla = s.group(1).upper()
        resto = resto[: s.start()]
    # Un'unione, un consorzio o un'azienda non sono il comune stesso
    if re.search(r"\b(unione|consorzio|comunita|azienda|associazione|montana|metropolitana)\b", forma(resto)):
        return None
    # Dopo il trattino c'e' un nome in un'altra lingua ("... - GEMEINDE KIENS") o un'intitolazione
    # ("... - CARLO VOLONTE'"): il comune e' la parte prima. Un "ufficio tecnico" resta il comune.
    resto = re.split(r"\s+-\s+", resto, maxsplit=1)[0]
    f = forma(resto)
    return (f, sigla) if f else None


class Anagrafica:
    """Comuni per nome e per codice fiscale. Si costruisce una volta e si interroga per riga."""

    def __init__(self, comuni: list[tuple[str, str, str | None]], cf_ipa: dict[str, str] | None = None):
        # comuni: [(istat, nome, sigla provincia o None)]
        self.per_nome: dict[str, list[tuple[str, str | None]]] = {}
        # "Doberdo' del Lago-Doberdob", "Sgonico-Zgonik": solo come ripiego, mai in concorrenza col nome intero
        self.per_variante: dict[str, set[str]] = {}
        for istat, nome, sigla in comuni:
            # "Chienes/Kiens": si indicizzano entrambe le forme
            varianti = {forma(p) for p in re.split(r"[/]", nome)} | {forma(nome)}
            # "COMUNE DELLA SPEZIA" / "COMUNE DELL'AQUILA": l'articolo del nome e' stato mangiato
            # dalla preposizione, quindi si indicizza anche senza ("la spezia" -> "spezia")
            varianti |= {re.sub(r"^(?:il|lo|la|l|i|gli|le)\s+", "", v) for v in varianti}
            for variante in varianti:
                if variante and (istat, sigla) not in self.per_nome.get(variante, []):
                    self.per_nome.setdefault(variante, []).append((istat, sigla))
            if "-" in nome:
                for parte in nome.split("-"):
                    f = forma(parte)
                    if len(f) >= 4:
                        self.per_variante.setdefault(f, set()).add(istat)
        self.cf_ipa = {k.strip().zfill(11): v for k, v in (cf_ipa or {}).items()}

    def risolvi(self, denominazione: str | None, codice_fiscale: str | None) -> tuple[str | None, str]:
        """(istat, motivo). motivo spiega anche i casi senza comune: serve ai conteggi."""
        if isinstance(denominazione, str) and forma(denominazione) in ALIAS_DENOMINAZIONI:
            return ALIAS_DENOMINAZIONI[forma(denominazione)], "alias"
        if isinstance(denominazione, str) and denominazione.strip().upper() in ALIAS_ACCENTATI:
            return ALIAS_ACCENTATI[denominazione.strip().upper()], "alias"
        parsed = nome_comune_da_attuatore(denominazione)
        cf = codice_fiscale.strip().zfill(11) if isinstance(codice_fiscale, str) and codice_fiscale.strip() else ""
        if cf and cf in self.cf_ipa:
            istat = self.cf_ipa[cf]
            # Il CF dice quale ente, ma se il nome indica un altro comune c'e' un'incongruenza: meglio niente
            if parsed is None or any(i == istat for i, _ in self.per_nome.get(parsed[0], [])):
                return istat, "codice_fiscale"
        if parsed is None:
            return None, "non_e_un_comune"
        nome, sigla = parsed
        candidati = self.per_nome.get(nome, [])
        if sigla:
            candidati = [c for c in candidati if c[1] == sigla] or candidati
        istat = {i for i, _ in candidati}
        if len(istat) == 1:
            return next(iter(istat)), "nome"
        if istat:
            return None, "nome_ambiguo"
        if nome in ALIAS_NOMI:
            return ALIAS_NOMI[nome], "alias"
        parti = self.per_variante.get(nome, set())
        if len(parti) == 1:
            return next(iter(parti)), "nome_bilingue"
        # Denominazione troncata dal dataset: un prefisso lungo che porta a UN solo comune
        if len(nome) >= LUNGHEZZA_TRONCAMENTO:
            prefissi = {i for chiave, v in self.per_nome.items() if chiave.startswith(nome) for i, _ in v}
            if len(prefissi) == 1:
                return next(iter(prefissi)), "nome_troncato"
        return None, "nome_sconosciuto"
