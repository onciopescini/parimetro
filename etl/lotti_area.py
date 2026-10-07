"""Le regole per classificare un lotto ANAC in un'area di spesa con Jev: il testo da leggere, le aree, la soglia.

Qui c'e' solo logica pura (nessuna rete, nessun database): si prova con i test. L'invio a Jev e' in
13_classifica_lotti.py. Le aree sono quelle del sito (lib/categorie.ts) piu' "altro".
"""
MODELLO = "jev-latest"
SOGLIA = 0.5  # sotto questa confidenza il lotto conta come "non classificabile" (deve restare uguale in SQL)

# Le stesse descrizioni provate nel banco di prova (etl/benchmark/confronta_lotti.py): non cambiarle senza rifare la prova.
CRITERI = {
    "rifiuti": "waste collection, street cleaning of waste, landfill, waste disposal",
    "strade_trasporti": "roads, sidewalks, street lighting, road signs, parking, public transport, cycle paths",
    "istruzione": "schools, nurseries, school meals, school transport, school buildings",
    "sociale_sanita": "social services, care for minors, elderly or disabled people, health, poverty support",
    "ambiente_territorio": "public green areas, trees, parks, landslides and hydrogeological risk, sewers, water, forestry",
    "cultura_sport_turismo": "culture, museums, libraries, churches as heritage, sports facilities, tourism, events",
    "utenze": "electricity, gas, heating fuel and vehicle fuel supply",
    "funzionamento": "running the administration: IT, software, offices, treasury, insurance, postage, tax collection support, elections",
    "patrimonio": "maintenance of municipal buildings and property, cemeteries, heating and electrical systems of buildings",
    "altro": "none of the above or unclear",
}

DOMANDA = {
    "area": {
        "type": "choice",
        "instructions": "Which area of the municipal budget does this public procurement lot belong to?",
        "criteria": CRITERI,
    }
}


def stato_lotto(tipo: str | None, oggetto: str | None, cpv_descr: str | None) -> str:
    """Il testo che Jev legge: lo stesso formato del banco di prova."""
    return (f"Public procurement lot of an Italian municipality. Type: {tipo}. "
            f"Object: {oggetto}. CPV category: {cpv_descr}")


def chiave_testo(tipo: str | None, oggetto: str | None, cpv_descr: str | None) -> tuple:
    """Lotti con lo stesso testo hanno la stessa risposta: si chiede una volta sola."""
    return (tipo or "", " ".join((oggetto or "").upper().split()), cpv_descr or "")


def risposta_valida(r: dict) -> tuple[str, float] | None:
    """(area, confidenza) se la risposta e' usabile; altrimenti None (il lotto resta da rifare)."""
    area = r.get("choice")
    if area not in CRITERI:
        return None
    try:
        conf = float(r.get("confidence", 1.0))
    except (TypeError, ValueError):
        return None
    return area, max(0.0, min(1.0, conf))


# ------------------------------------------------------------------ che cosa si compra (stessa chiamata, due domande in piu')
INTERVENTI = {
    "nuova_opera": "construction of a new building, road, plant or infrastructure; new works and redevelopment projects",
    "manutenzione": "maintenance, repair, renovation or restoration of existing buildings, roads, systems or equipment",
    "fornitura": "purchase or supply of goods: equipment, vehicles, furniture, materials, fuel, energy, food, supplies",
    "servizio": "ongoing or recurring services for the municipality: cleaning, waste collection, canteen, transport, social services, IT, events, insurance",
    "incarico_tecnico": "professional or technical appointments: design, works supervision, safety coordination, studies, consulting, legal or accounting advice",
    "altro": "none of the above or unclear",
}

# Una domanda a una cosa sola, come raccomanda TypeSafe: l'area, il tipo di intervento e se la descrizione e' troppo vaga.
DOMANDE_INTERVENTO = {
    "intervento": {
        "type": "choice",
        "instructions": "What is the municipality buying or doing with this public procurement lot?",
        "criteria": INTERVENTI,
    },
    "vago": {
        "type": "noul",
        "instructions": ("The description is too vague to tell what is being bought or done "
                         "(for example only a legal reference, a generic word like 'direct award', or a code)."),
    },
}
DOMANDE_COMPLETE = {**DOMANDA, **DOMANDE_INTERVENTO}
SOGLIA_VAGO = 0.7  # sopra, il lotto conta come "non classificabile" per il tipo di intervento (uguale in SQL)


def risposta_intervento(r: dict) -> tuple[str, float, float] | None:
    """(intervento, confidenza, vago) se le risposte sono usabili; altrimenti None."""
    i = r.get("intervento") or {}
    v = r.get("vago") or {}
    scelta = i.get("choice")
    if scelta not in INTERVENTI:
        return None
    try:
        conf = max(0.0, min(1.0, float(i.get("confidence", 1.0))))
        vago = max(0.0, min(1.0, float(v.get("noul", 0.0))))
    except (TypeError, ValueError):
        return None
    return scelta, conf, vago
