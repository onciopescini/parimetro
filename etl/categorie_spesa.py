# ============================================================
# categorie_spesa.py · da un codice gestionale SIOPE a natura e area
#
# Il codice gestionale (11 caratteri, es. U1030215004) e' il piano dei conti
# finanziario armonizzato (D.Lgs. 118/2011). E' gerarchico:
#
#   U 1 03 02 15 004
#   | | |  |  |  `-- voce          "raccolta rifiuti"
#   | | |  |  `----- livello 4     "contratti di servizio pubblico"
#   | | |  `-------- livello 3     "acquisto di servizi"
#   | | `----------- macroaggregato"acquisto di beni e servizi"
#   | `------------- titolo        1 = spese correnti, 2 = conto capitale
#   `--------------- U = uscita
#
# NATURA (che tipo di spesa e') si ricava dalla sola struttura del codice.
#
# AREA (a cosa serve: rifiuti, strade, scuole...) NON sta nel codice: sta solo
# nella descrizione della voce. E' una tabella di corrispondenza fatta a mano,
# per prefisso con eccezioni sulla singola voce, controllabile riga per riga.
# Non e' un modello statistico: lo stesso codice da' sempre la stessa area.
#
# LIMITE DICHIARATO: l'area e' "per natura della voce", non la classificazione
# funzionale per missione/programma (che SIOPE a livello gestionale non ha).
# Una scuola costruita da un'unica voce "Fabbricati ad uso scolastico" e'
# istruzione; le voci generiche ("n.a.c.", "altri servizi") restano in
# "non_attribuibile" invece di essere indovinate.
# ============================================================

AREE: dict[str, str] = {
    "personale": "Personale",
    "rifiuti": "Rifiuti e igiene urbana",
    "strade_trasporti": "Strade, illuminazione e trasporti",
    "istruzione": "Scuole e istruzione",
    "sociale_sanita": "Servizi sociali e sanità",
    "ambiente_territorio": "Ambiente, suolo e acqua",
    "cultura_sport_turismo": "Cultura, sport e turismo",
    "utenze": "Utenze ed energia",
    "debito": "Debito e interessi",
    "trasferimenti_imposte": "Trasferimenti, contributi e imposte",
    "funzionamento": "Funzionamento dell'ente",
    "patrimonio": "Immobili e patrimonio",
    "non_attribuibile": "Non attribuibile",
}

NATURE: dict[str, str] = {
    "personale": "Personale",
    "imposte_e_tasse": "Imposte e tasse",
    "beni_e_servizi": "Beni e servizi",
    "trasferimenti_correnti": "Trasferimenti correnti",
    "interessi_passivi": "Interessi passivi",
    "altre_spese_correnti": "Altre spese correnti",
    "investimenti": "Investimenti diretti",
    "contributi_investimenti": "Contributi agli investimenti",
    "altre_spese_capitale": "Altre spese in conto capitale",
    "attivita_finanziarie": "Attività finanziarie",
    "rimborso_prestiti": "Rimborso di prestiti",
}

# Natura da titolo + macroaggregato (caratteri 1-4 del codice, es. "1030")
_NATURA_PER_MACRO = {
    "101": "personale",
    "102": "imposte_e_tasse",
    "103": "beni_e_servizi",
    "104": "trasferimenti_correnti",
    "107": "interessi_passivi",
    "108": "altre_spese_correnti",
    "109": "altre_spese_correnti",
    "110": "altre_spese_correnti",
    "201": "altre_spese_capitale",
    "202": "investimenti",
    "203": "contributi_investimenti",
    "204": "contributi_investimenti",
    "205": "altre_spese_capitale",
}


def natura(codice: str) -> str:
    """Natura economica, dalla sola struttura del codice. Mai indovinata."""
    t = codice[1:2]
    if t == "3":
        return "attivita_finanziarie"
    if t == "4":
        return "rimborso_prestiti"
    return _NATURA_PER_MACRO.get(codice[1:4], "altre_spese_correnti" if t == "1" else "altre_spese_capitale")


# Area per prefisso: vince il prefisso piu' LUNGO, quindi un'eccezione su una
# singola voce (11 caratteri) batte la regola del gruppo (6 o 4 caratteri).
_AREA_PER_PREFISSO: dict[str, str] = {
    # --- spese correnti ---------------------------------------------------
    "U101": "personale",
    "U1020": "trasferimenti_imposte",
    "U10301": "funzionamento",                 # beni di consumo
    "U1030102012": "cultura_sport_turismo",    # accessori per attivita' sportive
    "U1030102999": "non_attribuibile",         # altri beni n.a.c.
    "U1030103": "ambiente_territorio",         # fauna e flora
    "U1030105": "sociale_sanita",              # prodotti farmaceutici e sanitari
    "U10302": "funzionamento",                 # acquisto di servizi, regola generale
    "U1030205": "utenze",                      # telefonia, energia, acqua, gas
    "U1030212": "personale",                   # lavoro flessibile e interinale
    "U1030213006": "rifiuti",                  # smaltimento rifiuti tossico-nocivi
    "U1030215001": "strade_trasporti",         # trasporto pubblico
    "U1030215002": "istruzione",               # trasporto scolastico
    "U1030215003": "sociale_sanita",           # trasporto disabili e anziani
    "U1030215004": "rifiuti",
    "U1030215005": "rifiuti",
    "U1030215006": "istruzione",               # mense scolastiche
    "U1030215007": "istruzione",               # formazione dei cittadini
    "U1030215008": "sociale_sanita",
    "U1030215009": "sociale_sanita",
    "U1030215010": "sociale_sanita",           # asili nido
    "U1030215011": "ambiente_territorio",      # randagismo
    "U1030215012": "strade_trasporti",         # aree di sosta
    "U1030215013": "ambiente_territorio",      # servizio idrico
    "U1030215014": "utenze",                   # distribuzione del gas
    "U1030215015": "strade_trasporti",         # illuminazione pubblica
    "U1030215999": "non_attribuibile",         # altri contratti di servizio
    "U1030218": "sociale_sanita",              # servizi sanitari e socio-sanitari
    "U1030299008": "strade_trasporti",         # bus navetta
    "U1030299009": "ambiente_territorio",      # verde e arredo urbano
    "U1030299999": "non_attribuibile",         # altri servizi diversi n.a.c.
    "U104": "trasferimenti_imposte",
    "U1040202": "sociale_sanita",              # assegni e sussidi assistenziali
    "U1040203001": "istruzione",               # borse di studio
    "U1070": "debito",
    "U1080": "debito",
    "U1090101": "personale",                   # rimborsi per spese di personale
    "U1090": "funzionamento",
    "U1090201": "trasferimenti_imposte",       # rimborsi di imposte
    "U1090202": "trasferimenti_imposte",
    "U1100301": "trasferimenti_imposte",       # IVA a debito
    "U110": "funzionamento",                   # assicurazioni, contenzioso, sanzioni
    "U1109999999": "non_attribuibile",
    # --- conto capitale ---------------------------------------------------
    "U201": "trasferimenti_imposte",           # tributi in conto capitale
    "U20201": "funzionamento",                 # mezzi, mobili, impianti, hardware
    "U2020109": "patrimonio",                  # fabbricati e opere, regola generale
    "U2020109003": "istruzione",               # fabbricati ad uso scolastico
    "U2020109008": "cultura_sport_turismo",    # opere destinate al culto
    "U2020109009": "funzionamento",            # infrastrutture telematiche
    "U2020109010": "ambiente_territorio",      # infrastrutture idrauliche
    "U2020109012": "strade_trasporti",
    "U2020109013": "strade_trasporti",
    "U2020109014": "ambiente_territorio",      # sistemazione del suolo
    "U2020109015": "ambiente_territorio",      # cimiteri
    "U2020109016": "cultura_sport_turismo",    # impianti sportivi
    "U2020109017": "sociale_sanita",           # asili nido
    "U2020109018": "cultura_sport_turismo",    # musei, teatri, biblioteche
    "U2020109999": "patrimonio",
    "U2020110": "cultura_sport_turismo",       # beni di valore culturale e storico
    "U2020199001": "cultura_sport_turismo",    # materiale bibliografico
    "U2020199999": "non_attribuibile",
    "U2020201": "patrimonio",                  # terreni
    "U2020202": "ambiente_territorio",         # demanio idrico, foreste, fauna, flora
    "U2020302": "funzionamento",               # software
    "U2020305001": "non_attribuibile",         # incarichi professionali per investimenti
    "U2020306001": "non_attribuibile",
    "U2020399001": "non_attribuibile",
    "U2020409012": "ambiente_territorio",      # sistemazione del suolo in leasing
    "U203": "trasferimenti_imposte",           # contributi agli investimenti
    "U204": "trasferimenti_imposte",
    "U205": "trasferimenti_imposte",           # rimborsi in conto capitale
    "U2059999999": "non_attribuibile",
    # --- operazioni finanziarie -------------------------------------------
    "U3": "non_attribuibile",                  # partecipazioni, depositi
    "U4": "debito",                            # rimborso di prestiti
}

# Lunghezze possibili dei prefissi, dalla piu' lunga: serve a cercare dal piu' specifico
_LUNGHEZZE = sorted({len(p) for p in _AREA_PER_PREFISSO}, reverse=True)


def area(codice: str) -> str:
    """Area di spesa. Un codice che nessuna regola copre finisce in 'non_attribuibile':
    meglio ammettere di non sapere che indovinare."""
    for n in _LUNGHEZZE:
        a = _AREA_PER_PREFISSO.get(codice[:n])
        if a:
            return a
    return "non_attribuibile"


def classifica(codice: str) -> tuple[str, str]:
    """(natura, area) di un codice gestionale."""
    return natura(codice), area(codice)
