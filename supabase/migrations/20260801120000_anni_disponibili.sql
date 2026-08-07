-- ============================================================
-- Anni con almeno un bilancio caricato.
--
-- Serve al frontend per costruire il selettore dell'esercizio dai dati
-- invece che da un elenco cablato: prima il pannello offriva 2020-2025
-- mentre su Supabase il 2025 non esiste, e sceglierlo svuotava la mappa
-- facendo sembrare l'app rotta.
-- ============================================================
create or replace function get_available_years()
returns int[]
language sql stable as $$
  select coalesce(array_agg(distinct year order by year), '{}')
  from budget_records
$$;
