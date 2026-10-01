-- Posizione nella fascia: un dato mancante non e' "0%".
--
-- Un comune senza entrate (il tesoriere non le ha trasmesse) usciva con "piu' alto
-- del 0% dei simili": come dire che incassa meno di tutti, mentre non lo sappiamo.
-- Ora e' NULL. E il denominatore conta solo i comuni che hanno quel dato, per non
-- falsare la percentuale con chi non ce l'ha.
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
    'pct_revenue',     (select case when (select rpc from io) is null then null else round(100.0 * count(*) filter (where p.rpc <= i.rpc) / nullif(count(p.rpc), 0)) end from pari p, io i),
    'pct_expenditure', (select case when (select epc from io) is null then null else round(100.0 * count(*) filter (where p.epc <= i.epc) / nullif(count(p.epc), 0)) end from pari p, io i),
    'pct_fhi',         (select case when (select fhi from io) is null then null else round(100.0 * count(*) filter (where p.fhi <= i.fhi) / nullif(count(p.fhi), 0)) end from pari p, io i)
  ) end
$$;
