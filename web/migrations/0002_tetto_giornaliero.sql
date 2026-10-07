-- Un contatore per giorno e per voce, per non superare una spesa prevista (oggi: le chiamate a Jev della chat).
-- Tabella a parte da `limiti`: quella si ripulisce ogni poche ore, questa deve durare tutto il giorno.
CREATE TABLE IF NOT EXISTS tetto_giornaliero (
  chiave TEXT NOT NULL,       -- es. "jev"
  giorno INTEGER NOT NULL,    -- giorni dal 1 gennaio 1970, UTC
  n INTEGER NOT NULL,
  PRIMARY KEY (chiave, giorno)
);
