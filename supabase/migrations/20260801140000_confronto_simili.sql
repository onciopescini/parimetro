-- ============================================================
-- Confronto con i comuni simili (stessa fascia demografica).
--
-- Il paragone con la media nazionale è fuorviante: 2.000 €/ab a Milano e
-- 2.000 €/ab in un paese di 800 abitanti non significano la stessa cosa,
-- perché i costi fissi di un comune si spalmano su pochi residenti. Le
-- fasce sono quelle usate abitualmente nella finanza locale.
--
-- MEDIANA e non media: i valori pro capite hanno code lunghissime (un
-- contributo in conto capitale una tantum su 78 abitanti fa 73.000 €/ab)
-- e la media ne verrebbe trascinata via.
-- ============================================================
create or replace function fascia_demografica(p_pop int)
returns text language sql immutable as $$
  select case
    when p_pop is null or p_pop < 1000 then 'sotto 1.000 abitanti'
    when p_pop <   5000 then 'da 1.000 a 5.000 abitanti'
    when p_pop <  20000 then 'da 5.000 a 20.000 abitanti'
    when p_pop <  60000 then 'da 20.000 a 60.000 abitanti'
    when p_pop < 250000 then 'da 60.000 a 250.000 abitanti'
    else 'oltre 250.000 abitanti'
  end
$$;

create or replace function get_peer_comparison(p_istat text, p_year int)
returns jsonb language sql stable as $$
  with io as (
    select b.population pop, b.revenue_per_capita rpc,
           b.expenditure_per_capita epc, b.debt_per_capita dpc,
           b.financial_health_score fhi
    from budget_records b
    join municipalities m on m.id = b.municipality_id
    where m.istat_code = p_istat and b.year = p_year
  ),
  pari as (
    select b.revenue_per_capita rpc, b.expenditure_per_capita epc,
           b.debt_per_capita dpc, b.financial_health_score fhi
    from budget_records b, io
    where b.year = p_year
      and fascia_demografica(b.population) = fascia_demografica(io.pop)
  )
  select case when not exists (select 1 from io) then null else jsonb_build_object(
    'fascia', (select fascia_demografica(pop) from io),
    'n',      (select count(*) from pari),
    -- mediane della fascia: stessa forma di get_national_averages, così il
    -- drawer può scambiare le due basi di confronto senza altra logica
    'revenue_pc',     (select round(percentile_cont(0.5) within group (order by rpc)::numeric, 2) from pari),
    'expenditure_pc', (select round(percentile_cont(0.5) within group (order by epc)::numeric, 2) from pari),
    'debt_pc',        (select round(percentile_cont(0.5) within group (order by dpc)::numeric, 2) from pari),
    'fhi',            (select round(percentile_cont(0.5) within group (order by fhi))::int from pari),
    -- posizione del comune dentro la fascia, 0-100
    'pct_revenue',     (select round(100.0 * count(*) filter (where p.rpc <= i.rpc) / nullif(count(*), 0)) from pari p, io i),
    'pct_expenditure', (select round(100.0 * count(*) filter (where p.epc <= i.epc) / nullif(count(*), 0)) from pari p, io i),
    'pct_fhi',         (select round(100.0 * count(*) filter (where p.fhi <= i.fhi) / nullif(count(*), 0)) from pari p, io i)
  ) end
$$;
