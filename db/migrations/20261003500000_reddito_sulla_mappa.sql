-- Il reddito imponibile medio (IRPEF) come grandezza della mappa 3D: una proprieta' in piu' sui comuni
-- e la media pesata sui contribuenti per le province. Null dove il dato manca (celle oscurate).

create or replace function get_geo_budget(p_year int, p_tolerance numeric default null)
returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(feature), '[]'::jsonb)
  )
  from (
    select jsonb_build_object(
      'type', 'Feature',
      'geometry', ST_AsGeoJSON(
        case
          when p_tolerance is not null then ST_SimplifyPreserveTopology(m.geom, p_tolerance)
          else coalesce(m.geom_simplified, m.geom)
        end, 5)::jsonb,
      'properties', jsonb_build_object(
        'istat',             m.istat_code,
        'name',              m.name,
        'region',            m.region,
        'province',          m.province,
        'population',        b.population,
        'revenue_total',     b.revenue_total,
        'expenditure_total', b.expenditure_total,
        'debt_total',        b.debt_total,
        'surplus_deficit',   b.surplus_deficit,
        'revenue_pc',        b.revenue_per_capita,
        'expenditure_pc',    b.expenditure_per_capita,
        'debt_pc',           b.debt_per_capita,
        'fhi',               b.financial_health_score,
        'reddito_medio',     r.medio
      )
    ) as feature
    from municipalities m
    join budget_records b on b.municipality_id = m.id and b.year = p_year
    left join reddito_pc r on r.istat = m.istat_code and r.year = p_year
  ) sub
$$;

create or replace function get_province_aggregates(p_year int)
returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'province',          province,
    'region',            region,
    'lon',               lon,
    'lat',               lat,
    'population',        population,
    'revenue_total',     revenue_total,
    'expenditure_total', expenditure_total,
    'debt_total',        debt_total,
    'surplus_deficit',   surplus_deficit,
    'revenue_pc',        round(revenue_total     / nullif(population, 0), 2),
    'expenditure_pc',    round(expenditure_total / nullif(population, 0), 2),
    'debt_pc',           round(debt_total        / nullif(population, 0), 2),
    'fhi',               fhi,
    'reddito_medio',     round(imponibile / nullif(contribuenti, 0))
  )), '[]'::jsonb)
  from (
    select m.province,
           m.region,
           avg(ST_X(ST_Centroid(m.geom)))      as lon,
           avg(ST_Y(ST_Centroid(m.geom)))      as lat,
           sum(b.population)                   as population,
           sum(b.revenue_total)                as revenue_total,
           sum(b.expenditure_total)            as expenditure_total,
           sum(b.debt_total)                   as debt_total,
           sum(b.surplus_deficit)              as surplus_deficit,
           round(avg(b.financial_health_score))::int as fhi,
           -- media pesata sui contribuenti dei soli comuni con dato; null se la provincia non ne ha
           sum(r.medio * r.contribuenti)       as imponibile,
           sum(r.contribuenti)                 as contribuenti
    from municipalities m
    join budget_records b on b.municipality_id = m.id and b.year = p_year
    left join reddito_pc r on r.istat = m.istat_code and r.year = p_year
    group by m.province, m.region
  ) sub
$$;
