-- ============================================================
-- Spesa per voce, natura e area, con confronto tra comuni simili.
--
-- Prima la spesa era un unico totale per comune. SIOPE porta pero' il codice
-- gestionale (~400 voci per comune: raccolta rifiuti, infrastrutture stradali,
-- energia elettrica...) che veniva buttato. Da qui si passa da "quanto spende"
-- a "in cosa spende, rispetto ai suoi pari".
--
--   spese_voci        anagrafica: codice, descrizione, natura (dal codice) e
--                     area (tabella a mano in etl/categorie_spesa.py)
--   budget_items      importo di ogni voce per bilancio (comune+anno): il dettaglio
--   area_pc           per ogni bilancio e area: importo, pro capite e posizione
--                     fra i comuni della stessa fascia demografica
--   area_mediane      mediana pro capite per anno, fascia e area
--
-- GLI ZERI CONTANO. Un comune che non spende nulla per i rifiuti non ha righe
-- in budget_items per quell'area, ma nel confronto vale 0: escluderlo
-- alzerebbe la mediana della fascia e farebbe sembrare tutti gli altri
-- spendaccioni. Per questo area_pc fa un cross join con le aree.
-- ============================================================

create table if not exists spese_voci (
  codice      varchar(11) primary key,
  descrizione text not null,
  natura      text not null,
  area        text not null
);

create table if not exists budget_items (
  budget_id uuid not null references budget_records(id) on delete cascade,
  codice    varchar(11) not null references spese_voci(codice),
  importo   numeric(15,2) not null,
  primary key (budget_id, codice)
);
create index if not exists idx_budget_items_codice on budget_items (codice);

-- Se si ridefiniscono le viste va ripulito in ordine: dipendono l'una dall'altra
drop materialized view if exists area_mediane;
drop materialized view if exists area_pc;

create materialized view area_pc as
with aree as (select distinct area from spese_voci),
base as (
  -- solo i bilanci per cui il dettaglio e' stato caricato
  select b.id as budget_id, b.year, b.population,
         fascia_demografica(b.population) as fascia, a.area
  from budget_records b
  cross join aree a
  where exists (select 1 from budget_items i where i.budget_id = b.id)
),
tot as (
  select i.budget_id, v.area, sum(i.importo) as importo
  from budget_items i join spese_voci v using (codice)
  group by 1, 2
)
select base.budget_id, base.year, base.fascia, base.area,
       coalesce(tot.importo, 0) as importo,
       coalesce(tot.importo, 0) / nullif(base.population, 0) as pc,
       percent_rank() over (
         partition by base.year, base.fascia, base.area
         order by coalesce(tot.importo, 0) / nullif(base.population, 0)
       ) as rango
from base left join tot using (budget_id, area);

create index idx_area_pc_budget on area_pc (budget_id);

create materialized view area_mediane as
select year, fascia, area, count(*) as n,
       percentile_cont(0.5) within group (order by pc) as mediana_pc
from area_pc
where pc is not null
group by 1, 2, 3;

create unique index idx_area_mediane on area_mediane (year, fascia, area);

-- Da lanciare dopo ogni import del dettaglio, come refresh_fhi()
create or replace function refresh_aree() returns void
language plpgsql volatile as $$
begin
  refresh materialized view area_pc;
  refresh materialized view area_mediane;
end $$;

-- ------------------------------------------------------------
-- La scheda di un comune: aree col confronto, nature, e le voci che pesano.
-- Null se per quel comune e anno il dettaglio non e' stato caricato.
-- ------------------------------------------------------------
create or replace function get_categorie_comune(p_istat text, p_year int)
returns jsonb
language sql stable as $$
  with b as (
    select b.id, b.population
    from budget_records b join municipalities m on m.id = b.municipality_id
    where m.istat_code = p_istat and b.year = p_year
  ),
  voci as (
    select v.codice, v.descrizione, v.area, v.natura, i.importo,
           row_number() over (order by i.importo desc, v.codice) as pos
    from budget_items i join spese_voci v using (codice) join b on b.id = i.budget_id
    where i.importo > 0
  ),
  tot as (select coalesce(sum(importo), 0) as t from voci)
  select case when exists (select 1 from voci) then jsonb_build_object(
    'totale', (select t from tot),
    'aree', (
      select jsonb_agg(jsonb_build_object(
        'area', a.area,
        'importo', a.importo,
        'pc', round(a.pc::numeric, 2),
        'mediana_pc', round(m.mediana_pc::numeric, 2),
        'n_simili', m.n,
        -- posizione fra i simili, 0-100: quanti spendono meno di lui in quell'area
        'rango', round(100 * a.rango)::int
      ) order by a.importo desc)
      from area_pc a
      join b on b.id = a.budget_id
      left join area_mediane m on m.year = a.year and m.fascia = a.fascia and m.area = a.area
    ),
    'nature', (
      select jsonb_agg(jsonb_build_object('natura', natura, 'importo', s) order by s desc)
      from (select natura, sum(importo) as s from voci group by natura) x
    ),
    -- Le prime 25 voci: nel Molise le prime 40 su 362 valgono il 75% della spesa
    'voci', (
      select jsonb_agg(jsonb_build_object(
        'codice', codice, 'descrizione', descrizione, 'area', area, 'importo', importo
      ) order by pos)
      from voci where pos <= 25
    ),
    'altre_voci', jsonb_build_object(
      'n', (select count(*) from voci where pos > 25),
      'importo', coalesce((select sum(importo) from voci where pos > 25), 0)
    )
  ) end
$$;
