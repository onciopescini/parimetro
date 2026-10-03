-- ============================================================
-- Redditi IRPEF per comune (MEF, Dipartimento delle Finanze).
--
-- Serve a leggere la spesa accanto alla ricchezza di chi vive nel comune: 800 €
-- a persona hanno un peso diverso dove il reddito medio e' 14.000 € o 28.000 €.
--
-- Quale reddito? L'IMPONIBILE. Le celle con pochi contribuenti sono oscurate dal
-- MEF (segreto statistico): nei comuni piccoli mancano le fasce alte e varie
-- categorie di reddito, quindi il "reddito complessivo" ricostruito sommando le
-- fasce risulterebbe sistematicamente troppo basso proprio dove contano i
-- singoli. L'imponibile e il numero di contribuenti, invece, ci sono sempre, in
-- tutti gli anni. Le altre colonne si conservano ma sono NULL se oscurate.
-- ============================================================
create table if not exists irpef_comuni (
  istat_code       varchar(6) not null,
  year             int        not null,           -- anno d'imposta
  contribuenti     int        not null,
  imponibile_freq  int,
  imponibile_euro  numeric(16,0),
  complessivo_freq int,                           -- solo dal 2023: prima non pubblicato
  complessivo_euro numeric(16,0),
  addizionale_freq int,                           -- addizionale comunale dovuta
  addizionale_euro numeric(15,0),
  dipendente_euro  numeric(16,0),
  pensione_euro    numeric(16,0),
  fabbricati_euro  numeric(16,0),
  autonomo_euro    numeric(16,0),
  impresa_euro     numeric(16,0),                 -- ordinaria + semplificata
  partecipazione_euro numeric(16,0),
  fasce            jsonb,                         -- contribuenti per fascia di reddito (null = oscurata)
  primary key (istat_code, year)
);

comment on table irpef_comuni is
  'Dichiarazioni IRPEF per comune e anno d''imposta (MEF). I valori NULL sono celle oscurate per il segreto statistico: non sono zeri.';

-- Reddito medio di ogni comune, con la posizione fra i comuni della stessa fascia.
-- Vista materializzata: il rango e la mediana sono per coorte (anno x fascia).
drop materialized view if exists reddito_pc;
create materialized view reddito_pc as
with base as (
  select i.istat_code as istat, i.year, fascia_demografica(b.population) as fascia,
         i.contribuenti,
         i.imponibile_euro / nullif(i.contribuenti, 0)         as medio,
         i.imponibile_euro / nullif(b.population, 0)           as pc,
         i.addizionale_euro / nullif(i.contribuenti, 0)        as addizionale_media
  from irpef_comuni i
  join municipalities m on m.istat_code = i.istat_code
  join budget_records b on b.municipality_id = m.id and b.year = i.year
  where i.imponibile_euro is not null
),
mediane as (
  select year, fascia, count(*) as n,
         percentile_cont(0.5) within group (order by medio) as mediana
  from base group by 1, 2
)
select b.istat, b.year, b.fascia, b.contribuenti,
       round(b.medio::numeric, 0)             as medio,
       round(b.pc::numeric, 0)                as pc,
       round(b.addizionale_media::numeric, 0) as addizionale_media,
       round(100 * percent_rank() over (partition by b.year, b.fascia order by b.medio))::int as rango,
       round(m.mediana::numeric, 0)           as mediana_simili,
       m.n                                    as n_simili
from base b
join mediane m on m.year = b.year and m.fascia = b.fascia;

create unique index idx_reddito_pc on reddito_pc (istat, year);
create index idx_reddito_pc_ranking on reddito_pc (year, medio);

-- Da lanciare dopo ogni import: IRPEF, ma anche i bilanci (la fascia viene dalla popolazione)
create or replace function refresh_reddito() returns void
language plpgsql volatile as $$
begin
  refresh materialized view reddito_pc;
end $$;

-- La scheda del reddito di un comune: un oggetto per anno. Null se non ci sono dati.
create or replace function get_reddito_comune(p_istat text)
returns jsonb language sql stable as $$
  select jsonb_object_agg(
           r.year::text,
           jsonb_build_object(
             'contribuenti', r.contribuenti,
             'medio', r.medio,
             'pc', r.pc,
             'addizionale_media', r.addizionale_media,
             'rango', r.rango,
             'mediana_simili', r.mediana_simili,
             'n_simili', r.n_simili
           ) order by r.year)
  from reddito_pc r
  where r.istat = p_istat
$$;
