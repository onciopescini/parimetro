-- Concorrenza nelle gare dei comuni (ANAC, dataset "aggiudicazioni"): quante offerte arrivano e di quanto
-- si ribassa. Contano solo le procedure con una gara vera (aperte, ristrette, negoziate): in un
-- affidamento diretto non c'e' concorrenza da misurare. L'anno e' quello di pubblicazione del lotto
-- (appalti_comuni.anno): le date di aggiudicazione del dataset hanno anni impossibili (3202, 7655).
--
-- Dati dell'aggiudicazione, non i nomi delle imprese: i vincitori (dataset "aggiudicatari") non si usano.

create table if not exists aggiudicazioni_comuni (
  cig          varchar(20) primary key references appalti_comuni (cig) on delete cascade,
  offerte      int,            -- offerte ammesse; null se non indicato o impossibile
  ribasso      numeric(6,3),   -- % rispetto alla base di gara, 0-100; null fuori da questo intervallo
  importo_agg  numeric(16,2)   -- importo aggiudicato; non si somma (stesse cautele degli importi di gara)
);

drop materialized view if exists concorrenza_pc;
create materialized view concorrenza_pc as
with gare as (
  select a.istat, a.anno, g.offerte, g.ribasso
  from appalti_comuni a
  join aggiudicazioni_comuni g on g.cig = a.cig
  where a.famiglia in ('aperta', 'ristretta', 'negoziata')
),
per_comune as (
  select istat, anno,
         count(*)                                         as n_gare,
         count(offerte)                                   as n_con_offerte,
         count(*) filter (where offerte = 1)              as n_offerta_unica,
         percentile_cont(0.5) within group (order by offerte) filter (where offerte is not null) as offerte_mediane,
         count(ribasso)                                   as n_con_ribasso,
         percentile_cont(0.5) within group (order by ribasso) filter (where ribasso is not null) as ribasso_mediano
  from gare group by 1, 2
),
con_fascia as (
  select p.*, fascia_demografica(m.population) as fascia,
         -- Sotto 5 gare con l'informazione la quota non dice nulla (1 su 2 = 50%): non entra nel confronto
         case when p.n_con_offerte >= 5 then p.n_offerta_unica::numeric / p.n_con_offerte end as q_unica
  from per_comune p join municipalities m on m.istat_code = p.istat
),
ranghi as (
  select istat, anno, round(100 * percent_rank() over (partition by anno, fascia order by q_unica))::int as rango
  from con_fascia where q_unica is not null
),
mediane as (
  select anno, fascia, count(q_unica) as n_simili,
         percentile_cont(0.5) within group (order by q_unica) as m_unica
  from con_fascia group by 1, 2
)
select c.istat, c.anno, c.n_gare, c.n_con_offerte, c.n_offerta_unica,
       round(100.0 * c.q_unica, 1)                                  as quota_offerta_unica,
       round((100 * m.m_unica)::numeric, 1)                         as mediana_quota_offerta_unica,
       r.rango                                                      as rango_offerta_unica,
       m.n_simili,
       round(c.offerte_mediane::numeric, 1)                         as offerte_mediane,
       -- il ribasso mediano si mostra solo con almeno 5 gare che lo indicano
       case when c.n_con_ribasso >= 5 then round(c.ribasso_mediano::numeric, 1) end as ribasso_mediano
from con_fascia c
join mediane m on m.anno = c.anno and m.fascia = c.fascia
left join ranghi r on r.istat = c.istat and r.anno = c.anno;

create unique index idx_concorrenza_pc on concorrenza_pc (istat, anno);

create or replace function refresh_concorrenza() returns void
language plpgsql volatile as $$
begin
  refresh materialized view concorrenza_pc;
end $$;

-- Un oggetto per anno. Null se il comune non ha gare con aggiudicazione.
create or replace function get_concorrenza_comune(p_istat text)
returns jsonb language sql stable as $$
  select (
    select jsonb_object_agg(c.anno::text, jsonb_build_object(
      'n_gare', c.n_gare, 'n_con_offerte', c.n_con_offerte, 'n_offerta_unica', c.n_offerta_unica,
      'quota_offerta_unica', c.quota_offerta_unica, 'mediana_quota_offerta_unica', c.mediana_quota_offerta_unica,
      'rango_offerta_unica', c.rango_offerta_unica, 'n_simili', c.n_simili,
      'offerte_mediane', c.offerte_mediane, 'ribasso_mediano', c.ribasso_mediano) order by c.anno)
    from concorrenza_pc c where c.istat = p_istat
  )
$$;
