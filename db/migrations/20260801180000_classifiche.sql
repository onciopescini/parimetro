-- ============================================================
-- Classifiche navigabili.
--
-- Oggi per trovare qualcosa bisogna sapere cosa cercare: la ricerca serve
-- chi ha già un comune in mente. La classifica serve a scoprire, ed è il
-- naturale complemento del rango per fascia demografica.
--
-- Come per search_municipalities: prima si sceglie e si limita su colonne
-- leggere, POI si calcola ST_PointOnSurface, che costa ~26 ms a riga.
-- ============================================================

-- Elenco dei filtri disponibili, con i conteggi: serve a popolare le tendine
-- senza che il frontend debba cablare le etichette delle fasce (che vivono
-- in fascia_demografica() e devono restare una sola verità).
create or replace function get_ranking_filters(p_year int)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'fasce', (
      select coalesce(jsonb_agg(jsonb_build_object('fascia', f, 'n', n) order by pop_min), '[]'::jsonb)
      from (
        select fascia_demografica(b.population) f, count(*) n, min(b.population) pop_min
        from budget_records b where b.year = p_year
        group by 1
      ) x
    ),
    'regioni', (
      select coalesce(jsonb_agg(distinct m.region order by m.region), '[]'::jsonb)
      from municipalities m
    )
  )
$$;

-- Il tipo di ritorno e' cambiato (colonna 'concentrata'): create or replace non basta
drop function if exists get_ranking(int, text, text, text, boolean, int);

create or replace function get_ranking(
  p_year   int,
  p_metric text default 'fhi',      -- fhi | revenue_pc | expenditure_pc | autonomia
  p_fascia text default null,       -- null = tutte le fasce
  p_region text default null,       -- null = tutta Italia
  p_desc   boolean default true,    -- true = dal migliore/più alto
  p_limit  int default 10
)
returns table (
  posizione  int,
  istat      varchar(10),
  name       varchar(250),
  region     varchar(100),
  province   varchar(100),
  population int,
  valore     numeric,
  fhi        int,
  autonomia  numeric,   -- mostrata in elenco: è lo spareggio, va reso visibile
  fascia     text,
  concentrata numeric,  -- % della spesa in una sola voce: il pro capite di quest'anno e' anomalo
  lon        double precision,
  lat        double precision
)
language sql stable as $$
  with scelti as (
    select b.municipality_id,
           m.istat_code, m.name, m.region, m.province, b.population,
           case p_metric
             when 'revenue_pc'     then b.revenue_per_capita
             when 'expenditure_pc' then b.expenditure_per_capita
             when 'autonomia'      then round(100 * b.own_revenue / nullif(b.revenue_current, 0), 1)
             else b.financial_health_score::numeric
           end as valore,
           b.financial_health_score as fhi,
           -- Serve come spareggio: il rango è un intero 0-100 su 7.895 comuni,
           -- quindi ~35 enti condividono ogni valore. A parità vince chi ha
           -- più autonomia finanziaria, che è una delle due componenti del
           -- rango: molto meglio che ordinare per popolazione.
           b.own_revenue / nullif(b.revenue_current, 0) as autonomia_ordinamento,
           fascia_demografica(b.population) as fascia,
           b.quota_voce_max as concentrata
    from budget_records b
    join municipalities m on m.id = b.municipality_id
    where b.year = p_year
      and (p_fascia is null or fascia_demografica(b.population) = p_fascia)
      and (p_region is null or m.region = p_region)
  ),
  ordinati as (
    select s.*,
           row_number() over (
             order by case when p_desc then s.valore end desc nulls last,
                      case when not p_desc then s.valore end asc nulls last,
                      -- spareggio sull'autonomia, nella stessa direzione
                      case when p_desc then s.autonomia_ordinamento end desc nulls last,
                      case when not p_desc then s.autonomia_ordinamento end asc nulls last,
                      s.name                       -- ultimo spareggio: stabile e riproducibile
           )::int as posizione
    from scelti s
    where s.valore is not null
  ),
  tagliati as (
    select * from ordinati where posizione <= greatest(1, least(p_limit, 100))
  )
  select t.posizione, t.istat_code, t.name, t.region, t.province, t.population,
         t.valore, t.fhi,
         round(100 * t.autonomia_ordinamento, 1) as autonomia,
         t.fascia,
         t.concentrata,
         ST_X(ST_PointOnSurface(m.geom))::double precision,
         ST_Y(ST_PointOnSurface(m.geom))::double precision
  from tagliati t
  join municipalities m on m.id = t.municipality_id
  order by t.posizione
$$;
