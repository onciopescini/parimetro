// ============================================================
// Connessione a Postgres.
//
// Sostituisce @supabase/supabase-js: le RPC che usavamo sono normali
// funzioni Postgres, e con il database in casa non serve un livello REST
// in mezzo. Meno dipendenze, e le query le controlliamo noi.
// ============================================================
import { Pool } from "pg";

// In sviluppo Next ricarica i moduli a ogni modifica: senza il globale si
// aprirebbe un pool nuovo a ogni salvataggio finche' Postgres rifiuta.
const globali = globalThis as unknown as { _pool?: Pool };

/**
 * Il pool nasce alla prima query, non all'import.
 * Next raccoglie i dati delle rotte durante la build, quando il database non
 * c'e' e DATABASE_URL non e' impostata: fallire li' bloccherebbe la build per
 * un problema che riguarda solo l'esecuzione.
 */
function pool(): Pool {
  if (globali._pool) return globali._pool;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL mancante: vedi selfhost/.env.example");

  const p = new Pool({
    connectionString: url,
    max: 8,
    idleTimeoutMillis: 30_000,
    // Il carico e' di sola lettura e le query pesanti sono in cache: una
    // richiesta oltre i 15s e' sintomo di un problema, non di lentezza.
    statement_timeout: 15_000,
  });
  globali._pool = p;
  return p;
}

/** Funzione Postgres che ritorna un singolo valore (jsonb o scalare). */
export async function chiamaScalare<T>(fn: string, args: unknown[]): Promise<T> {
  const segnaposto = args.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await pool().query(`select ${fn}(${segnaposto}) as v`, args);
  return rows[0]?.v as T;
}

/** Funzione Postgres che ritorna righe (returns table). */
export async function chiamaTabella<T>(fn: string, args: unknown[]): Promise<T[]> {
  const segnaposto = args.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await pool().query(`select * from ${fn}(${segnaposto})`, args);
  return rows as T[];
}
