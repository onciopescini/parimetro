-- ============================================================
-- Appalti dei comuni (ANAC, Banca dati nazionale dei contratti pubblici).
--
-- Un record per CIG (lotto) il cui committente e' un comune. Dato ANAC con licenza CC BY-SA 4.0:
-- i file derivati che pubblichiamo restano sotto la stessa licenza (vedi NOTICE).
--
-- ⚠ L'IMPORTO DEL LOTTO NON SI PUO' SOMMARE COSI' COM'E'. In un solo mese dei comuni, 11 lotti su
--   11.730 facevano due terzi del totale: buoni pasto da 1,1 miliardi per un comune di 12.000
--   abitanti (errori di inserimento) e adesioni a convenzioni Consip in cui l'importo e' il massimale
--   dell'accordo, non cio' che il comune spende. Per questo:
--     · i CONTEGGI e le QUOTE (affidamenti diretti, piattaforme) sono sempre calcolati su tutti i lotti;
--     · gli IMPORTI si sommano solo sui lotti "attendibili": non adesioni a convenzioni/accordi quadro
--       e non superiori a 10 volte tutti i pagamenti annui del comune. Gli altri si contano a parte.
-- ============================================================
create table if not exists appalti_comuni (
  cig             text primary key,
  istat           varchar(6) not null,
  anno            smallint   not null,            -- anno di pubblicazione
  data_pubblicazione date,
  oggetto         text,
  importo         numeric(16,2),                  -- importo del lotto, come dichiarato
  tipo            text,                           -- LAVORI | SERVIZI | FORNITURE
  procedura       text,                           -- etichetta ANAC del tipo di scelta del contraente
  famiglia        text not null,                  -- diretto | in_house | adesione | aperta | ristretta | negoziata | altra
  cpv             text,
  cpv_descr       text,
  aggiudicata     boolean,                        -- solo dove l'esito e' noto (dati recenti)
  urgenza         boolean,                        -- NON pubblicato: 1-3% fino al 2023 e 83% nel 2024, significato cambiato
  pnrr            boolean,
  piattaforma     boolean,                        -- svolta su piattaforma telematica (dati recenti)
  perfezionamento date                            -- ultimo aggiornamento: tra due versioni vince la piu' recente
);
create index if not exists idx_appalti_istat_anno on appalti_comuni (istat, anno);

comment on table appalti_comuni is 'Lotti (CIG) banditi da comuni - ANAC, CC BY-SA 4.0. importo NON sommabile senza filtri: vedi appalti_pc.';

-- Per comune e anno. Il tetto di attendibilita' dipende dai pagamenti annui del comune; senza
-- bilancio per quell'anno si usa un tetto fisso (50 milioni).
drop materialized view if exists appalti_pc;
create materialized view appalti_pc as
with lotti as (
  select a.istat, a.anno, a.cig, a.importo, a.famiglia, a.tipo, a.piattaforma, a.pnrr, a.urgenza,
         10 * b.expenditure_total as cap,
         (a.famiglia <> 'adesione'
          and a.importo is not null and a.importo > 0
          and a.importo <= coalesce(10 * b.expenditure_total, 50000000)) as attendibile
  from appalti_comuni a
  left join municipalities m on m.istat_code = a.istat
  left join budget_records b on b.municipality_id = m.id and b.year = a.anno
),
per_comune as (
  select istat, anno,
         count(*)                                                   as n,
         count(*) filter (where famiglia in ('diretto', 'in_house')) as n_diretti,
         count(*) filter (where famiglia = 'adesione')               as n_adesioni,
         count(*) filter (where famiglia = 'aperta')                 as n_aperte,
         count(*) filter (where piattaforma)                         as n_piattaforma,
         count(*) filter (where piattaforma is not null)             as n_con_info_piattaforma,
         count(*) filter (where pnrr)                                as n_pnrr,
         count(*) filter (where urgenza)                             as n_urgenza,
         -- importo impossibile (oltre 10 volte i pagamenti annui del comune): un refuso, non una spesa
         count(*) filter (where famiglia <> 'adesione' and importo > coalesce(cap, 50000000)) as n_importo_anomalo,
         -- lotti senza importo: dato mancante, non un'anomalia
         count(*) filter (where famiglia <> 'adesione' and (importo is null or importo = 0)) as n_senza_importo,
         sum(importo) filter (where attendibile)                     as importo,
         sum(importo) filter (where attendibile and famiglia in ('diretto', 'in_house')) as importo_diretti,
         percentile_cont(0.5) within group (order by importo) filter (where attendibile) as importo_mediano
  from lotti group by 1, 2
),
con_fascia as (
  select p.*, fascia_demografica(m.population) as fascia, m.population as pop,
         -- Sotto 5 lotti la quota di affidamenti diretti non dice nulla (2 su 3 = 67%): non entra nel confronto
         case when p.n >= 5 then p.n_diretti::numeric / p.n end as q_diretti
  from per_comune p join municipalities m on m.istat_code = p.istat
),
-- Il rango si calcola solo fra chi ha una quota (n >= 5): i NULL in un window finirebbero in cima
ranghi as (
  select istat, anno,
         round(100 * percent_rank() over (partition by anno, fascia order by q_diretti))::int as rango
  from con_fascia where q_diretti is not null
),
mediane as (
  select anno, fascia, count(q_diretti) as n_simili,
         percentile_cont(0.5) within group (order by q_diretti) as m_diretti
  from con_fascia group by 1, 2
)
select c.istat, c.anno, c.fascia, c.pop, c.n, c.n_diretti, c.n_adesioni, c.n_aperte, c.n_piattaforma,
       c.n_con_info_piattaforma, c.n_pnrr, c.n_urgenza, c.n_importo_anomalo, c.n_senza_importo, c.importo, c.importo_diretti,
       c.importo_mediano,
       round(1000.0 * c.n / nullif(c.pop, 0), 1) as n_per_1000,
       round(100.0 * c.n_diretti / nullif(c.n, 0), 1) as quota_diretti,
       -- Il campo "strumento di svolgimento" nel 2024 e' quasi sempre vuoto: sotto meta' dei lotti non si mostra
       case when c.n_con_info_piattaforma >= 5 and c.n_con_info_piattaforma >= 0.5 * c.n
            then round(100.0 * c.n_piattaforma / c.n_con_info_piattaforma, 1) end as quota_piattaforma,
       r.rango as rango_diretti,
       round((m.m_diretti * 100)::numeric, 1) as mediana_quota_diretti,
       m.n_simili
from con_fascia c
join mediane m on m.anno = c.anno and m.fascia = c.fascia
left join ranghi r on r.istat = c.istat and r.anno = c.anno;

create unique index idx_appalti_pc on appalti_pc (istat, anno);

create or replace function refresh_appalti() returns void
language plpgsql volatile as $$
begin
  refresh materialized view appalti_pc;
end $$;

-- La scheda degli appalti di un comune. Null se il comune non ha alcun lotto.
create or replace function get_appalti_comune(p_istat text)
returns jsonb language sql stable as $$
  select case when not exists (select 1 from appalti_comuni where istat = p_istat) then null else
  jsonb_build_object(
    'anni', (
      select jsonb_object_agg(a.anno::text, jsonb_build_object(
        'n', a.n, 'n_per_1000', a.n_per_1000,
        'n_diretti', a.n_diretti, 'quota_diretti', a.quota_diretti,
        'mediana_quota_diretti', a.mediana_quota_diretti, 'rango_diretti', a.rango_diretti, 'n_simili', a.n_simili,
        'n_adesioni', a.n_adesioni, 'n_aperte', a.n_aperte,
        'quota_piattaforma', a.quota_piattaforma, 'n_pnrr', a.n_pnrr,
        'importo', a.importo, 'importo_diretti', a.importo_diretti, 'importo_mediano', a.importo_mediano,
        'n_importo_anomalo', a.n_importo_anomalo, 'n_senza_importo', a.n_senza_importo) order by a.anno)
      from appalti_pc a where a.istat = p_istat
    ),
    'tipi', coalesce((
      select jsonb_object_agg(tipo, n) from (
        select coalesce(tipo, 'n.d.') as tipo, count(*) as n from appalti_comuni where istat = p_istat group by 1) t
    ), '{}'::jsonb),
    'famiglie', coalesce((
      select jsonb_object_agg(famiglia, n) from (
        select famiglia, count(*) as n from appalti_comuni where istat = p_istat group by 1) f
    ), '{}'::jsonb),
    -- Le piu' grandi, ma solo fra i lotti attendibili (stesse regole della vista)
    'maggiori', coalesce((
      select jsonb_agg(jsonb_build_object(
               'anno', anno, 'oggetto', left(oggetto, 200), 'importo', importo, 'tipo', tipo,
               'procedura', procedura, 'cig', cig) order by importo desc)
      from (
        select a.* from appalti_comuni a
        left join municipalities m on m.istat_code = a.istat
        left join budget_records b on b.municipality_id = m.id and b.year = a.anno
        where a.istat = p_istat and a.famiglia <> 'adesione' and a.importo > 0
          and a.importo <= coalesce(10 * b.expenditure_total, 50000000)
        order by a.importo desc limit 8
      ) t
    ), '[]'::jsonb)
  ) end
$$;
