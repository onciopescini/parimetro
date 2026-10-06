-- Accesso facoltativo: solo l'email, e cio' che la persona sceglie di conservare.
-- Nessuna password. I codici di accesso e di sessione si salvano solo come impronta (SHA-256).

CREATE TABLE utenti (
  id TEXT PRIMARY KEY,                 -- casuale, non deriva dall'email
  email TEXT NOT NULL UNIQUE,          -- minuscola, senza spazi
  creato_il INTEGER NOT NULL,          -- secondi unix
  ultimo_accesso INTEGER NOT NULL
);

CREATE TABLE codici_accesso (
  impronta TEXT PRIMARY KEY,           -- SHA-256 del codice mandato per email
  email TEXT NOT NULL,
  scade_il INTEGER NOT NULL,
  usato INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX codici_email ON codici_accesso (email, scade_il);

CREATE TABLE sessioni (
  impronta TEXT PRIMARY KEY,           -- SHA-256 del cookie
  utente_id TEXT NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  scade_il INTEGER NOT NULL
);
CREATE INDEX sessioni_utente ON sessioni (utente_id);

CREATE TABLE comuni_salvati (
  utente_id TEXT NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  istat TEXT NOT NULL,
  nome TEXT NOT NULL,
  avviso INTEGER NOT NULL DEFAULT 1,   -- 1 = scrivimi quando esce un nuovo bilancio
  ultimo_anno_avvisato INTEGER,        -- per non avvisare due volte
  salvato_il INTEGER NOT NULL,
  PRIMARY KEY (utente_id, istat)
);

CREATE TABLE card_create (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utente_id TEXT NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  istat TEXT NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,                  -- cento | tre | confronto
  anno INTEGER NOT NULL,
  creata_il INTEGER NOT NULL
);
CREATE INDEX card_utente ON card_create (utente_id, creata_il);

CREATE TABLE domande_chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utente_id TEXT NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  testo TEXT NOT NULL,
  fatta_il INTEGER NOT NULL
);
CREATE INDEX domande_utente ON domande_chat (utente_id, fatta_il);

-- Limiti di richieste (per email e per indirizzo, per ora), azzerati di continuo
CREATE TABLE limiti (
  chiave TEXT NOT NULL,                -- es. "email:<impronta>" o "ip:<impronta>"
  finestra INTEGER NOT NULL,           -- ora unix
  n INTEGER NOT NULL,
  PRIMARY KEY (chiave, finestra)
);
