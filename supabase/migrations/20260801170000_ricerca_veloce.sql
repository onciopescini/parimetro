-- ============================================================
-- La ricerca era troppo lenta e sbatteva contro lo statement_timeout.
--
-- Sintomo: da browser search_municipalities impiegava 1,4-3,1 s e a volte
-- tornava errore, che il frontend interpretava come "nessun risultato": il
-- ripristino da deep link falliva a intermittenza.
--
-- Due cause:
--  1. il filtro con tre OR su name/istat_code forza un seq scan su 7.896
--     righe senza indice utilizzabile dall'ILIKE;
--  2. ST_PointOnSurface veniva calcolato dentro la stessa query del filtro:
--     su geometrie comunali dettagliate costa ~26 ms a riga.
--
-- Rimedio: indice trigram per l'ILIKE, e calcolo del punto spostato in una
-- query esterna che lavora solo sulle righe già selezionate e limitate.
-- ============================================================
create extension if not exists pg_trgm;

create index if not exists idx_municipalities_name_trgm
  on municipalities using gin (name gin_trgm_ops);

create or replace function search_municipalities(p_query text, p_limit int default 8)
returns table (
  istat      varchar(10),
  name       varchar(250),
  region     varchar(100),
  province   varchar(100),
  population int,
  lon        double precision,
  lat        double precision
)
language sql stable as $$
  -- Prima si scelgono le righe (colonne leggere), poi si calcola il punto:
  -- così ST_PointOnSurface gira al massimo p_limit volte invece che su tutte
  -- le righe che il planner decide di proiettare.
  with scelti as (
    select m.id, m.istat_code, m.name, m.region, m.province, m.population
    from municipalities m
    where m.istat_code = p_query
       or m.name ilike p_query || '%'
       or m.name ilike '% ' || p_query || '%'
    order by (m.istat_code = p_query) desc,
             (m.name ilike p_query || '%') desc,
             m.population desc
    limit greatest(1, least(p_limit, 25))
  )
  select s.istat_code, s.name, s.region, s.province, s.population,
         ST_X(ST_PointOnSurface(m.geom))::double precision,
         ST_Y(ST_PointOnSurface(m.geom))::double precision
  from scelti s
  join municipalities m on m.id = s.id
$$;
