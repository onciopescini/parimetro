-- ============================================================
-- Lo storico espone anche l'autonomia finanziaria.
--
-- È una delle due componenti del nuovo indice (l'altra è il saldo di cassa),
-- ma finora non era visibile da nessuna parte: il drawer mostrava il rango
-- senza dire da cosa nasce. Serve anche a riempire la card che con i dati
-- SIOPE resta vuota, dato che il debito non esiste.
--
-- autonomia = entrate proprie / entrate correnti, cioè titoli 1+3 su 1+2+3:
-- quanto l'ente si finanzia da sé invece che con i trasferimenti.
-- ============================================================
create or replace function get_municipality_history(p_istat varchar)
returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'year',              b.year,
    'revenue_total',     b.revenue_total,
    'expenditure_total', b.expenditure_total,
    'revenue_current',   b.revenue_current,
    'revenue_capital',   b.revenue_capital,
    'own_revenue',       b.own_revenue,
    'debt_total',        b.debt_total,
    'surplus_deficit',   b.surplus_deficit,
    'revenue_pc',        b.revenue_per_capita,
    'expenditure_pc',    b.expenditure_per_capita,
    'debt_pc',           b.debt_per_capita,
    'autonomia',         case when b.revenue_current > 0
                              then round(100 * b.own_revenue / b.revenue_current, 1) end,
    'fhi',               b.financial_health_score
  ) order by b.year), '[]'::jsonb)
  from budget_records b
  join municipalities m on m.id = b.municipality_id
  where m.istat_code = p_istat
$$;
