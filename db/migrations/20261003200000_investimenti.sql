-- ============================================================
-- Investimenti pubblici per comune: PNRR (Italia Domani) e politiche di coesione (OpenCoesione).
--
-- Due fonti DIVERSE, tenute separate (si sovrappongono su 74 CUP in tutto):
--
--  · PNRR. Il dataset non ha il comune: ha il soggetto attuatore. Un progetto e' attribuito a un
--    comune solo se il soggetto attuatore E' il comune (etl/investimenti.py). I progetti di RFI,
--    dei ministeri o delle Regioni hanno istat NULL: non sono un errore, il PNRR non li localizza.
--
--  · Coesione. Il progetto ha un territorio. Si usano solo i progetti localizzati su UN solo
--    comune: quelli su piu' comuni, su una provincia o su una regione non si possono dividere
--    (un progetto "nazionale" da 1,4 miliardi non va attribuito a un paese di 60 abitanti).
--    Solo i progetti pubblicati sul portale (OC_FLAG_VISUALIZZAZIONE = 0): senza duplicati ne'
--    grandi progetti ritirati.
-- ============================================================
create table if not exists progetti_pnrr (
  cup           text not null,
  misura        text not null,              -- ID Misura: un CUP puo' stare in piu' misure
  istat         varchar(6),                 -- NULL = il soggetto attuatore non e' un comune
  missione      text,
  descr_missione text,
  descr_misura  text,
  titolo        text,
  settore       text,
  attuatore     text,
  fin_pnrr      numeric(16,2),
  fin_totale    numeric(16,2),
  stato         text,                       -- In Corso | Concluso | Da Attivare
  data_inizio   date,
  data_fine     date,
  primary key (cup, misura)
);
create index if not exists idx_progetti_pnrr_istat on progetti_pnrr (istat) where istat is not null;

create table if not exists progetti_coesione (
  codice_locale text primary key,
  cup           text,
  istat         varchar(6) not null,
  -- natura: opere | servizi | beni | contributi | incentivi | capitale | altro
  natura        text not null,
  -- Il titolo manca per contributi e incentivi: sono nomi di imprese e di persone
  titolo        text,
  ciclo         smallint,                   -- 1 = 2007-13, 2 = 2014-20, 3 = 2021-27, 9 = 2000-06
  tema          text,
  settore       text,
  fin_pubblico  numeric(16,2),              -- al netto delle economie
  pagamenti     numeric(16,2),
  stato         text,
  data_inizio   date,
  data_fine     date,
  link          text
);
create index if not exists idx_coesione_istat_natura on progetti_coesione (istat, natura);

comment on table progetti_pnrr is 'Progetti PNRR (Italia Domani, CC BY 4.0). istat NULL = attuatore che non e'' un comune.';
comment on table progetti_coesione is 'Progetti di coesione localizzati su un solo comune (OpenCoesione, CC BY 4.0).';

-- Per abitante e posizione fra i comuni della stessa fascia. Gli zeri contano: un comune senza
-- alcun progetto attuato in proprio non ha "dato mancante", ha zero.
drop materialized view if exists investimenti_pc;
create materialized view investimenti_pc as
with comuni as (
  select m.istat_code as istat, m.population as pop, fascia_demografica(m.population) as fascia
  from municipalities m where m.population > 0
),
pnrr as (
  select istat, count(*) as n, sum(fin_pnrr) as fin from progetti_pnrr where istat is not null group by 1
),
opere as (
  select istat, count(*) as n, sum(fin_pubblico) as fin from progetti_coesione where natura = 'opere' group by 1
),
base as (
  select c.istat, c.fascia, c.pop,
         coalesce(p.n, 0)   as pnrr_n,   coalesce(p.fin, 0)  as pnrr_fin,
         coalesce(o.n, 0)   as opere_n,  coalesce(o.fin, 0)  as opere_fin,
         coalesce(p.fin, 0) / c.pop as pnrr_pc, coalesce(o.fin, 0) / c.pop as opere_pc
  from comuni c
  left join pnrr  p on p.istat = c.istat
  left join opere o on o.istat = c.istat
),
mediane as (
  select fascia, count(*) as n,
         percentile_cont(0.5) within group (order by pnrr_pc)  as m_pnrr,
         percentile_cont(0.5) within group (order by opere_pc) as m_opere
  from base group by 1
)
select b.istat, b.fascia, b.pnrr_n, b.pnrr_fin, b.opere_n, b.opere_fin,
       round(b.pnrr_pc::numeric, 0)  as pnrr_pc,
       round(b.opere_pc::numeric, 0) as opere_pc,
       round(100 * percent_rank() over (partition by b.fascia order by b.pnrr_pc))::int  as rango_pnrr,
       round(100 * percent_rank() over (partition by b.fascia order by b.opere_pc))::int as rango_opere,
       round(m.m_pnrr::numeric, 0)  as mediana_pnrr_pc,
       round(m.m_opere::numeric, 0) as mediana_opere_pc,
       m.n as n_simili
from base b join mediane m on m.fascia = b.fascia;

create unique index idx_investimenti_pc on investimenti_pc (istat);

create or replace function refresh_investimenti() returns void
language plpgsql volatile as $$
begin
  refresh materialized view investimenti_pc;
end $$;

-- La scheda degli investimenti di un comune. Null se il comune non esiste.
create or replace function get_investimenti_comune(p_istat text)
returns jsonb language sql stable as $$
  select case when not exists (select 1 from investimenti_pc where istat = p_istat) then null else
  jsonb_build_object(
    'pnrr', (
      select jsonb_build_object(
        'n', i.pnrr_n,
        'fin_pnrr', i.pnrr_fin,
        'fin_totale', (select coalesce(sum(fin_totale), 0) from progetti_pnrr where istat = p_istat),
        'pc', i.pnrr_pc, 'mediana_pc', i.mediana_pnrr_pc, 'rango', i.rango_pnrr, 'n_simili', i.n_simili,
        'conclusi', (select count(*) from progetti_pnrr where istat = p_istat and stato = 'Concluso'),
        'missioni', coalesce((
          select jsonb_agg(jsonb_build_object('missione', missione, 'descr', descr_missione, 'n', n, 'fin_pnrr', fin) order by fin desc)
          from (select missione, max(descr_missione) as descr_missione, count(*) as n, sum(fin_pnrr) as fin
                from progetti_pnrr where istat = p_istat group by missione) x
        ), '[]'::jsonb),
        'progetti', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'cup', cup, 'titolo', left(titolo, 200), 'misura', descr_misura, 'fin_pnrr', fin_pnrr,
                   'fin_totale', fin_totale, 'stato', stato, 'data_fine', data_fine) order by fin_pnrr desc nulls last)
          from (select * from progetti_pnrr where istat = p_istat order by fin_pnrr desc nulls last limit 8) t
        ), '[]'::jsonb)
      )
      from investimenti_pc i where i.istat = p_istat
    ),
    'coesione', (
      select jsonb_build_object(
        'opere', jsonb_build_object(
          'n', i.opere_n, 'fin', i.opere_fin,
          'pagamenti', (select coalesce(sum(pagamenti), 0) from progetti_coesione where istat = p_istat and natura = 'opere'),
          'pc', i.opere_pc, 'mediana_pc', i.mediana_opere_pc, 'rango', i.rango_opere, 'n_simili', i.n_simili,
          'stati', coalesce((
            select jsonb_object_agg(stato, n)
            from (select coalesce(stato, 'n.d.') as stato, count(*) as n
                  from progetti_coesione where istat = p_istat and natura = 'opere' group by 1) s
          ), '{}'::jsonb),
          'cicli', coalesce((
            select jsonb_agg(jsonb_build_object('ciclo', ciclo, 'n', n, 'fin', fin) order by ciclo)
            from (select ciclo, count(*) as n, sum(fin_pubblico) as fin
                  from progetti_coesione where istat = p_istat and natura = 'opere' group by ciclo) c
          ), '[]'::jsonb),
          'progetti', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'titolo', left(titolo, 200), 'ciclo', ciclo, 'tema', tema, 'fin', fin_pubblico,
                     'pagamenti', pagamenti, 'stato', stato,
                     'inizio', extract(year from data_inizio)::int, 'fine', extract(year from data_fine)::int,
                     'link', link) order by fin_pubblico desc nulls last)
            from (select * from progetti_coesione where istat = p_istat and natura = 'opere'
                  order by fin_pubblico desc nulls last limit 8) t
          ), '[]'::jsonb)
        ),
        -- Gli altri generi di intervento: solo conteggio e importo, mai i nomi
        'altri', coalesce((
          select jsonb_object_agg(natura, jsonb_build_object('n', n, 'fin', fin))
          from (select natura, count(*) as n, sum(fin_pubblico) as fin
                from progetti_coesione where istat = p_istat and natura <> 'opere' group by natura) a
        ), '{}'::jsonb)
      )
      from investimenti_pc i where i.istat = p_istat
    )
  ) end
$$;
