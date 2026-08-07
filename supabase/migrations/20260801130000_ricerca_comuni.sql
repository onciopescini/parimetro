-- ============================================================
-- Ricerca comune per nome o codice ISTAT.
--
-- Restituisce anche un punto su cui portare la camera: serve sia alla
-- barra di ricerca sia al ripristino da deep link (?comune=058091), che
-- interroga la stessa funzione passando il codice invece del nome.
--
-- ST_PointOnSurface e non ST_Centroid: su comuni a mezzaluna o con
-- exclave il centroide può cadere fuori dal territorio, il point-on-surface
-- è garantito interno.
-- ============================================================
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
  select m.istat_code, m.name, m.region, m.province, m.population,
         ST_X(ST_PointOnSurface(m.geom))::double precision,
         ST_Y(ST_PointOnSurface(m.geom))::double precision
  from municipalities m
  where m.istat_code = p_query
     or m.name ilike p_query || '%'
     or m.name ilike '% ' || p_query || '%'
  order by (m.istat_code = p_query) desc,          -- il codice esatto vince
           (m.name ilike p_query || '%') desc,     -- poi chi inizia col termine
           m.population desc                       -- a parità, il più popoloso
  limit greatest(1, least(p_limit, 25))
$$;
