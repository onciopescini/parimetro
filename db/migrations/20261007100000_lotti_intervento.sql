-- ============================================================
-- Che cosa si compra: oltre all'area di spesa, il tipo di intervento di ogni lotto (nuova opera, manutenzione,
-- fornitura, servizio, incarico tecnico) e se la descrizione e' troppo vaga. Stessa chiamata a Jev (TypeSafe), due
-- domande in piu'. Classificazione AUTOMATICA come l'area: si presenta sempre cosi'.
-- ============================================================
alter table lotti_area add column if not exists intervento text;
alter table lotti_area add column if not exists intervento_conf real;
alter table lotti_area add column if not exists vago real;   -- probabilita' (0-1) che la descrizione sia troppo vaga

-- La scheda degli appalti, ora con aree E interventi (la funzione sostituisce la precedente).
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
    ), '[]'::jsonb),
    -- Per anno (solo gli anni classificati): a quale area di spesa appartengono i lotti. "non_classificabile" =
    -- nessuna classificazione, confidenza sotto 0,5 oppure il modello ha detto "altro".
    'aree', coalesce((
      select jsonb_object_agg(anno::text, jsonb_build_object(
        'lotti', lotti, 'classificati', classificati, 'voci', voci) order by anno)
      from (
        select anno, sum(n) as lotti, coalesce(sum(n) filter (where area <> 'non_classificabile'), 0) as classificati,
               jsonb_agg(jsonb_build_object('area', area, 'n', n, 'importo', importo) order by n desc) as voci
        from (
          select x.anno,
                 case when l.cig is null or l.confidenza < 0.5 or l.area = 'altro' then 'non_classificabile' else l.area end as area,
                 count(*) as n,
                 sum(x.importo) filter (where x.attendibile) as importo
          from (
            select a.cig, a.anno, a.importo,
                   (a.importo is not null and a.importo > 0 and a.importo <= coalesce(10 * b.expenditure_total, 50000000)) as attendibile
            from appalti_comuni a
            left join municipalities m on m.istat_code = a.istat
            left join budget_records b on b.municipality_id = m.id and b.year = a.anno
            where a.istat = p_istat and a.famiglia <> 'adesione'
              and a.anno in (select y.anno from appalti_comuni y join lotti_area la on la.cig = y.cig where y.istat = p_istat)
          ) x left join lotti_area l on l.cig = x.cig
          group by 1, 2
        ) per_area
        group by anno
      ) per_anno
    ), '{}'::jsonb),
    -- Per anno (solo gli anni con il tipo di intervento): nuova opera, manutenzione, fornitura, servizio, incarico tecnico.
    -- "non_classificabile" = nessuna risposta, confidenza sotto 0,5, "altro", oppure descrizione troppo vaga (>= 0,7).
    'interventi', coalesce((
      select jsonb_object_agg(anno::text, jsonb_build_object(
        'lotti', lotti, 'classificati', classificati, 'voci', voci) order by anno)
      from (
        select anno, sum(n) as lotti, coalesce(sum(n) filter (where intervento <> 'non_classificabile'), 0) as classificati,
               jsonb_agg(jsonb_build_object('intervento', intervento, 'n', n, 'importo', importo) order by n desc) as voci
        from (
          select x.anno,
                 case when l.intervento is null or l.intervento_conf < 0.5 or l.intervento = 'altro' or l.vago >= 0.7
                      then 'non_classificabile' else l.intervento end as intervento,
                 count(*) as n,
                 sum(x.importo) filter (where x.attendibile) as importo
          from (
            select a.cig, a.anno, a.importo,
                   (a.importo is not null and a.importo > 0 and a.importo <= coalesce(10 * b.expenditure_total, 50000000)) as attendibile
            from appalti_comuni a
            left join municipalities m on m.istat_code = a.istat
            left join budget_records b on b.municipality_id = m.id and b.year = a.anno
            where a.istat = p_istat and a.famiglia <> 'adesione'
              and a.anno in (select y.anno from appalti_comuni y join lotti_area la on la.cig = y.cig
                             where y.istat = p_istat and la.intervento is not null)
          ) x left join lotti_area l on l.cig = x.cig
          group by 1, 2
        ) per_intervento
        group by anno
      ) per_anno
    ), '{}'::jsonb)
  ) end
$$;
