-- ============================================================================
-- MAPPA 3D DEI BILANCI DEI COMUNI ITALIANI
-- Modulo 1 · Schema Supabase (PostgreSQL 15+ / PostGIS)
--
-- Esegui con:  supabase db push   (oppure incolla nel SQL Editor di Supabase)
--
-- NOTA SUL FIX rispetto al master prompt originale:
-- le colonne GENERATED non possono referenziare altre tabelle, quindi
-- `population` viene "fotografata" per anno dentro budget_records
-- (un trigger la copia da municipalities se non fornita). Vantaggio extra:
-- i valori pro-capite storici restano corretti anche quando la popolazione
-- cambia nel tempo.
-- ============================================================================

create extension if not exists postgis;

-- ----------------------------------------------------------------------------
-- 1. ANAGRAFICA COMUNI (geometrie ISTAT, EPSG:4326)
-- ----------------------------------------------------------------------------
create table if not exists municipalities (
    id          uuid primary key default gen_random_uuid(),
    istat_code  varchar(10) unique not null,
    name        varchar(250) not null,
    region      varchar(100) not null,
    province    varchar(100) not null,
    population  int not null default 0,
    area_sqkm   numeric(10,2),
    geom        geometry(MultiPolygon, 4326) not null,
    -- punto rappresentativo (sempre interno al poligono, utile per label/colonne)
    centroid    geometry(Point, 4326)
                generated always as (st_pointonsurface(geom)) stored,
    created_at  timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- 2. REGISTRI DI BILANCIO (una riga per comune × anno)
-- ----------------------------------------------------------------------------
create table if not exists budget_records (
    id                      uuid primary key default gen_random_uuid(),
    municipality_id         uuid not null references municipalities(id) on delete cascade,
    year                    int  not null check (year between 2000 and 2100),
    population              int,                          -- snapshot per anno (v. trigger)
    revenue_total           numeric(15,2),
    expenditure_total       numeric(15,2),
    debt_total              numeric(15,2),
    surplus_deficit         numeric(15,2),

    revenue_per_capita      numeric(12,2) generated always as
        (case when population > 0 then round(revenue_total    / population, 2) end) stored,
    expenditure_per_capita  numeric(12,2) generated always as
        (case when population > 0 then round(expenditure_total / population, 2) end) stored,
    debt_per_capita         numeric(12,2) generated always as
        (case when population > 0 then round(debt_total       / population, 2) end) stored,
    surplus_per_capita      numeric(12,2) generated always as
        (case when population > 0 then round(surplus_deficit  / population, 2) end) stored,

    financial_health_score  int check (financial_health_score between 0 and 100),
    raw_details             jsonb,   -- breakdown per capitoli, es. {"entrate_correnti": ..., "spese_conto_capitale": ...}

    constraint unique_muni_year unique (municipality_id, year)
);

-- Trigger: se population non è indicata, copia il dato anagrafico corrente
create or replace function trg_fill_population()
returns trigger language plpgsql as $$
begin
    if new.population is null then
        select population into new.population
        from municipalities where id = new.municipality_id;
    end if;
    return new;
end $$;

drop trigger if exists budget_fill_population on budget_records;
create trigger budget_fill_population
    before insert or update on budget_records
    for each row execute function trg_fill_population();

-- ----------------------------------------------------------------------------
-- 3. INDICI (spaziali + performance)
-- ----------------------------------------------------------------------------
create index if not exists idx_municipalities_geom   on municipalities using gist (geom);
create index if not exists idx_municipalities_istat  on municipalities (istat_code);
create index if not exists idx_municipalities_region on municipalities (region);
create index if not exists idx_budget_muni_year      on budget_records (municipality_id, year);
create index if not exists idx_budget_year           on budget_records (year);

-- ----------------------------------------------------------------------------
-- 4. VISTE MATERIALIZZATE (medie nazionali + aggregati provinciali per il LOD)
-- ----------------------------------------------------------------------------
create materialized view if not exists national_yearly_stats as
select
    b.year,
    count(*)                                              as municipalities_count,
    round(avg(b.revenue_per_capita), 2)                   as avg_revenue_pc,
    round(avg(b.expenditure_per_capita), 2)               as avg_expenditure_pc,
    round(avg(b.debt_per_capita), 2)                      as avg_debt_pc,
    round(avg(b.surplus_per_capita), 2)                   as avg_surplus_pc,
    round((percentile_cont(0.5) within group (order by b.debt_per_capita))::numeric, 2)
                                                          as median_debt_pc,
    round(avg(b.financial_health_score), 1)               as avg_fhi
from budget_records b
group by b.year;

create unique index if not exists idx_national_stats_year on national_yearly_stats (year);

-- Aggregati per provincia: alimentano le colonne 3D a zoom nazionale (LOD 0–6)
create materialized view if not exists province_yearly_geo as
select
    m.province,
    min(m.region)                                         as region,
    b.year,
    count(*)                                              as municipalities_count,
    sum(b.population)                                     as population,
    sum(b.revenue_total)                                  as revenue_total,
    sum(b.expenditure_total)                              as expenditure_total,
    sum(b.debt_total)                                     as debt_total,
    sum(b.surplus_deficit)                                as surplus_deficit,
    round(sum(b.revenue_total)     / nullif(sum(b.population), 0), 2) as revenue_per_capita,
    round(sum(b.expenditure_total) / nullif(sum(b.population), 0), 2) as expenditure_per_capita,
    round(sum(b.debt_total)        / nullif(sum(b.population), 0), 2) as debt_per_capita,
    round(sum(b.surplus_deficit)   / nullif(sum(b.population), 0), 2) as surplus_per_capita,
    round(avg(b.financial_health_score))                  as fhi,
    st_x(st_centroid(st_collect(m.centroid)))             as lon,
    st_y(st_centroid(st_collect(m.centroid)))             as lat
from budget_records b
join municipalities m on m.id = b.municipality_id
group by m.province, b.year;

create unique index if not exists idx_province_geo_key on province_yearly_geo (province, year);

create or replace function refresh_stats()
returns void language plpgsql security definer as $$
begin
    refresh materialized view national_yearly_stats;
    refresh materialized view province_yearly_geo;
end $$;

-- ----------------------------------------------------------------------------
-- 5. FINANCIAL HEALTH INDEX (0–100)
--    v1 basata sui campi disponibili; pesi e componenti sono raffinabili
--    quando raw_details conterrà entrate proprie / velocità di cassa.
-- ----------------------------------------------------------------------------
create or replace function compute_financial_health(p_year int)
returns int language plpgsql security definer as $$
declare
    v_rows int;
begin
    with ranked as (
        select
            id,
            -- meno debito pro-capite degli altri comuni = punteggio più alto
            1 - percent_rank() over (order by coalesce(debt_per_capita, 0))       as debt_score,
            -- avanzo pro-capite migliore degli altri = punteggio più alto
            percent_rank() over (order by coalesce(surplus_per_capita, 0))        as surplus_score,
            -- capacità delle entrate di coprire la spesa (0..1, cap a 2x)
            least(coalesce(revenue_total / nullif(expenditure_total, 0), 1), 2) / 2 as balance_score
        from budget_records
        where year = p_year
    )
    update budget_records b
    set financial_health_score =
        round(100 * (0.40 * r.debt_score + 0.35 * r.surplus_score + 0.25 * r.balance_score))
    from ranked r
    where r.id = b.id;

    get diagnostics v_rows = row_count;
    return v_rows;
end $$;

-- ----------------------------------------------------------------------------
-- 6. RPC GEOSPAZIALI (consumate dalla Edge Function `geo-budgets`)
-- ----------------------------------------------------------------------------

-- 6a. Poligoni comunali + metriche, semplificati in base allo zoom e
--     filtrati per bounding box (LOD 7+)
create or replace function get_geo_budgets(
    p_year    int,
    p_zoom    int default 8,
    p_min_lon double precision default null,
    p_min_lat double precision default null,
    p_max_lon double precision default null,
    p_max_lat double precision default null
)
returns jsonb language sql stable as $$
    with params as (
        select case
            when p_zoom <= 7  then 0.010    -- ~1.1 km: vista regionale ampia
            when p_zoom <= 10 then 0.0025   -- ~280 m
            when p_zoom <= 12 then 0.0008   -- ~90 m
            else                   0.0002   -- alta risoluzione (LOD 13+)
        end as tol
    ),
    feats as (
        select jsonb_build_object(
            'type', 'Feature',
            'geometry',
                st_asgeojson(
                    st_simplifypreservetopology(m.geom, (select tol from params)), 5
                )::jsonb,
            'properties', jsonb_build_object(
                'istat_code',             m.istat_code,
                'name',                   m.name,
                'region',                 m.region,
                'province',               m.province,
                'population',             coalesce(b.population, m.population),
                'year',                   b.year,
                'revenue_total',          b.revenue_total,
                'expenditure_total',      b.expenditure_total,
                'debt_total',             b.debt_total,
                'surplus_deficit',        b.surplus_deficit,
                'revenue_per_capita',     b.revenue_per_capita,
                'expenditure_per_capita', b.expenditure_per_capita,
                'debt_per_capita',        b.debt_per_capita,
                'surplus_per_capita',     b.surplus_per_capita,
                'fhi',                    b.financial_health_score
            )
        ) as f
        from municipalities m
        join budget_records b
          on b.municipality_id = m.id and b.year = p_year
        where p_min_lon is null
           or m.geom && st_makeenvelope(p_min_lon, p_min_lat, p_max_lon, p_max_lat, 4326)
    )
    select jsonb_build_object(
        'type', 'FeatureCollection',
        'features', coalesce(jsonb_agg(f), '[]'::jsonb)
    )
    from feats;
$$;

-- 6b. Centroidi provinciali aggregati (LOD 0–6, colonne 3D leggere)
create or replace function get_geo_centroids(p_year int)
returns jsonb language sql stable as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'province',               p.province,
        'region',                 p.region,
        'year',                   p.year,
        'municipalities_count',   p.municipalities_count,
        'population',             p.population,
        'revenue_total',          p.revenue_total,
        'expenditure_total',      p.expenditure_total,
        'debt_total',             p.debt_total,
        'surplus_deficit',        p.surplus_deficit,
        'revenue_per_capita',     p.revenue_per_capita,
        'expenditure_per_capita', p.expenditure_per_capita,
        'debt_per_capita',        p.debt_per_capita,
        'surplus_per_capita',     p.surplus_per_capita,
        'fhi',                    p.fhi,
        'lon',                    p.lon,
        'lat',                    p.lat
    )), '[]'::jsonb)
    from province_yearly_geo p
    where p.year = p_year;
$$;

-- 6c. Dettaglio comune per il Drawer: serie storica, medie nazionali, rank FHI
create or replace function get_municipality_detail(p_istat text)
returns jsonb language sql stable as $$
    select jsonb_build_object(
        'municipality', (
            select jsonb_build_object(
                'istat_code', istat_code, 'name', name, 'region', region,
                'province', province, 'population', population, 'area_sqkm', area_sqkm
            )
            from municipalities where istat_code = p_istat
        ),
        'years', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'year', b.year, 'population', b.population,
                'revenue_total', b.revenue_total, 'expenditure_total', b.expenditure_total,
                'debt_total', b.debt_total, 'surplus_deficit', b.surplus_deficit,
                'revenue_per_capita', b.revenue_per_capita,
                'expenditure_per_capita', b.expenditure_per_capita,
                'debt_per_capita', b.debt_per_capita,
                'surplus_per_capita', b.surplus_per_capita,
                'fhi', b.financial_health_score,
                'raw_details', b.raw_details
            ) order by b.year), '[]'::jsonb)
            from budget_records b
            join municipalities m on m.id = b.municipality_id
            where m.istat_code = p_istat
        ),
        'national', (
            select coalesce(jsonb_agg(to_jsonb(n) order by n.year), '[]'::jsonb)
            from national_yearly_stats n
        ),
        'rank', (
            with latest as (
                select max(b.year) as y
                from budget_records b
                join municipalities m on m.id = b.municipality_id
                where m.istat_code = p_istat
            ),
            scored as (
                select
                    m.istat_code,
                    b.year,
                    rank()    over (order by b.financial_health_score desc nulls last) as fhi_national,
                    count(*)  over ()                                                  as of_national,
                    rank()    over (partition by m.region
                                    order by b.financial_health_score desc nulls last) as fhi_regional,
                    count(*)  over (partition by m.region)                             as of_regional
                from budget_records b
                join municipalities m on m.id = b.municipality_id
                where b.year = (select y from latest)
            )
            select jsonb_build_object(
                'year', year,
                'fhi_national', fhi_national, 'of_national', of_national,
                'fhi_regional', fhi_regional, 'of_regional', of_regional
            )
            from scored where istat_code = p_istat
        )
    );
$$;

-- ----------------------------------------------------------------------------
-- 7. SICUREZZA (RLS: lettura pubblica, scrittura solo service_role / ETL)
-- ----------------------------------------------------------------------------
alter table municipalities enable row level security;
alter table budget_records enable row level security;

drop policy if exists "public read municipalities" on municipalities;
create policy "public read municipalities"
    on municipalities for select to anon, authenticated using (true);

drop policy if exists "public read budgets" on budget_records;
create policy "public read budgets"
    on budget_records for select to anon, authenticated using (true);
-- (nessuna policy di insert/update/delete: le scritture passano solo dal
--  service_role, che bypassa la RLS — è il ruolo usato dalla pipeline ETL)

grant select on national_yearly_stats, province_yearly_geo to anon, authenticated;

grant execute on function get_geo_budgets(int, int, double precision, double precision, double precision, double precision)
    to anon, authenticated;
grant execute on function get_geo_centroids(int)        to anon, authenticated;
grant execute on function get_municipality_detail(text) to anon, authenticated;

-- Le funzioni "amministrative" non devono essere invocabili dal client
revoke execute on function compute_financial_health(int) from public, anon, authenticated;
revoke execute on function refresh_stats()               from public, anon, authenticated;
grant  execute on function compute_financial_health(int) to service_role;
grant  execute on function refresh_stats()               to service_role;
