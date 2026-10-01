-- ============================================================
-- MAPPA 3D DEI BILANCI DEI COMUNI ITALIANI
-- Modulo 1 · Schema Supabase (PostgreSQL 15+ / PostGIS)
-- Eseguire nell'SQL Editor di Supabase, dall'alto verso il basso.
-- ============================================================

create extension if not exists postgis;

-- ------------------------------------------------------------
-- 1 · ANAGRAFICA COMUNI + GEOMETRIE
-- ------------------------------------------------------------
create table if not exists municipalities (
    id              uuid primary key default gen_random_uuid(),
    istat_code      varchar(10) unique not null,
    name            varchar(250) not null,
    region          varchar(100) not null,
    province        varchar(100) not null,
    population      int not null check (population >= 0),
    area_sqkm       numeric(10,2),
    geom            geometry(MultiPolygon, 4326) not null,
    -- Geometria pre-semplificata: evita di semplificare 7.900 poligoni a ogni richiesta
    geom_simplified geometry(MultiPolygon, 4326),
    created_at      timestamptz default now()
);

comment on column municipalities.geom_simplified is
  'Geometria semplificata per il rendering web. Rigenerare dopo ogni import: update municipalities set geom_simplified = ST_Multi(ST_SimplifyPreserveTopology(geom, 0.004));';

-- ------------------------------------------------------------
-- 2 · REGISTRI DI BILANCIO
--    NOTA (fix al master prompt): "population" è duplicata qui come
--    snapshot annuale, perché (a) le colonne GENERATED non possono
--    leggere altre tabelle e (b) la popolazione cambia di anno in anno.
-- ------------------------------------------------------------
create table if not exists budget_records (
    id                     uuid primary key default gen_random_uuid(),
    municipality_id        uuid not null references municipalities(id) on delete cascade,
    year                   int not null check (year between 2000 and 2100),
    population             int not null check (population >= 0),

    revenue_total          numeric(15,2),
    expenditure_total      numeric(15,2),
    revenue_current        numeric(15,2),   -- entrate correnti
    revenue_capital        numeric(15,2),   -- entrate in conto capitale
    own_revenue            numeric(15,2),   -- entrate proprie (autonomia finanziaria)
    debt_total             numeric(15,2),
    surplus_deficit        numeric(15,2),   -- avanzo (+) / disavanzo (-)
    payments_made          numeric(15,2),   -- pagamenti effettuati (velocità di spesa)
    commitments            numeric(15,2),   -- impegni di spesa

    revenue_per_capita     numeric(12,2) generated always as (revenue_total     / nullif(population,0)) stored,
    expenditure_per_capita numeric(12,2) generated always as (expenditure_total / nullif(population,0)) stored,
    debt_per_capita        numeric(12,2) generated always as (debt_total        / nullif(population,0)) stored,

    financial_health_score int check (financial_health_score between 0 and 100),
    raw_details            jsonb,           -- dettaglio per capitoli di spesa
    constraint unique_muni_year unique (municipality_id, year)
);

-- ------------------------------------------------------------
-- 3 · INDICI SPAZIALI E DI PERFORMANCE
-- ------------------------------------------------------------
create index if not exists idx_municipalities_geom  on municipalities using gist (geom);
create index if not exists idx_municipalities_istat on municipalities (istat_code);
create index if not exists idx_budget_muni_year     on budget_records (municipality_id, year);
create index if not exists idx_budget_year          on budget_records (year);
create index if not exists idx_budget_year_fhi      on budget_records (year, financial_health_score);

-- ------------------------------------------------------------
-- 4 · FINANCIAL HEALTH INDEX (0–100)
--    Pesi: 30% debito pro capite · 25% autonomia finanziaria
--          20% velocità di spesa · 25% avanzo/disavanzo
--    Dati mancanti → contributo neutro (metà peso), mai penalizzante.
-- ------------------------------------------------------------
create or replace function compute_fhi(
    p_debt_per_capita numeric,
    p_own_revenue     numeric,
    p_revenue_total   numeric,
    p_payments        numeric,
    p_commitments     numeric,
    p_surplus         numeric
) returns int
language sql immutable as $$
  select least(100, greatest(0, round(
      coalesce(0.30 * (100 - least(greatest(p_debt_per_capita, 0), 2000) / 20.0), 15)   -- 0 €/ab=100 · ≥2000 €/ab=0
    + coalesce(0.25 * least(100, 100.0 * p_own_revenue / nullif(p_revenue_total, 0)), 12.5)
    + coalesce(0.20 * least(100, 100.0 * p_payments   / nullif(p_commitments,   0)), 10)
    + coalesce(0.25 * least(100, greatest(0, 50 + 50.0 * p_surplus / nullif(p_revenue_total, 0))), 12.5)
  )))::int
$$;

-- FHI calcolato automaticamente a ogni insert/update
create or replace function trg_set_fhi() returns trigger
language plpgsql as $$
begin
  new.financial_health_score := compute_fhi(
    new.debt_total / nullif(new.population, 0),
    new.own_revenue,
    new.revenue_total,
    new.payments_made,
    new.commitments,
    new.surplus_deficit
  );
  return new;
end $$;

drop trigger if exists set_fhi on budget_records;
create trigger set_fhi before insert or update on budget_records
for each row execute function trg_set_fhi();

-- ------------------------------------------------------------
-- 5 · RPC · GeoJSON dei comuni per anno (LOD alto, zoom ≥ ~6.3)
--    Usa geom_simplified se presente; p_tolerance forza una
--    semplificazione on-the-fly diversa (es. 0.01 per zoom bassi).
-- ------------------------------------------------------------
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
        'fhi',               b.financial_health_score
      )
    ) as feature
    from municipalities m
    join budget_records b on b.municipality_id = m.id and b.year = p_year
  ) sub
$$;

-- ------------------------------------------------------------
-- 6 · RPC · Aggregati provinciali (LOD basso, zoom < ~6.3)
--    Stesse chiavi dei comuni → il frontend usa un unico accessor.
-- ------------------------------------------------------------
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
    'fhi',               fhi
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
           round(avg(b.financial_health_score))::int as fhi
    from municipalities m
    join budget_records b on b.municipality_id = m.id and b.year = p_year
    group by m.province, m.region
  ) sub
$$;

-- ------------------------------------------------------------
-- 7 · RPC · Medie nazionali (per i comparativi % del drawer)
-- ------------------------------------------------------------
create or replace function get_national_averages(p_year int)
returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'revenue_pc',     round(avg(revenue_per_capita), 2),
    'expenditure_pc', round(avg(expenditure_per_capita), 2),
    'debt_pc',        round(avg(debt_per_capita), 2),
    'fhi',            round(avg(financial_health_score))::int
  )
  from budget_records
  where year = p_year
$$;

-- ------------------------------------------------------------
-- 8 · RPC · Serie storica di un comune (alimenta il drawer)
-- ------------------------------------------------------------
create or replace function get_municipality_history(p_istat varchar)
returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'year',              b.year,
    'revenue_total',     b.revenue_total,
    'expenditure_total', b.expenditure_total,
    'revenue_current',   b.revenue_current,
    'revenue_capital',   b.revenue_capital,
    'debt_total',        b.debt_total,
    'surplus_deficit',   b.surplus_deficit,
    'revenue_pc',        b.revenue_per_capita,
    'expenditure_pc',    b.expenditure_per_capita,
    'debt_pc',           b.debt_per_capita,
    'fhi',               b.financial_health_score
  ) order by b.year), '[]'::jsonb)
  from budget_records b
  join municipalities m on m.id = b.municipality_id
  where m.istat_code = p_istat
$$;

-- ------------------------------------------------------------
-- 9 · SICUREZZA · RLS in sola lettura (dati pubblici civic-tech)
-- ------------------------------------------------------------
alter table municipalities enable row level security;
alter table budget_records enable row level security;

drop policy if exists "lettura pubblica comuni"  on municipalities;
drop policy if exists "lettura pubblica bilanci" on budget_records;
create policy "lettura pubblica comuni"  on municipalities for select using (true);
create policy "lettura pubblica bilanci" on budget_records for select using (true);

-- I ruoli anon/authenticated erano di Supabase e su un Postgres normale non
-- esistono: questi grant facevano fallire l'intera migrazione al primo avvio.
-- Il lettore ora e' mappa_ro, creato da selfhost/init/01-ruoli.sh. Il blocco
-- condizionale serve a poter applicare le migrazioni anche su un database di
-- prova dove quel ruolo non c'e'.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'mappa_ro') then
    grant execute on function get_geo_budget(int, numeric)      to mappa_ro;
    grant execute on function get_province_aggregates(int)      to mappa_ro;
    grant execute on function get_national_averages(int)        to mappa_ro;
    grant execute on function get_municipality_history(varchar) to mappa_ro;
  else
    raise notice 'ruolo mappa_ro assente: grant saltati (normale fuori dal compose)';
  end if;
end $$;

-- (Il vecchio seed demo con tre comuni fittizi e' stato tolto: finiva nei dati
-- pubblicati. Per provare il sito senza database: npm run fixture.)
