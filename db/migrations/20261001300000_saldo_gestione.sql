-- ============================================================
-- Il rango usa il saldo di GESTIONE, non quello di cassa intero.
--
-- Misurato sul 2024 (7.891 comuni): i prestiti pesano l'1,8% degli incassi
-- (accensioni) e il 2,9% dei pagamenti (rimborsi), ma sono concentrati: il 10%
-- dei comuni sposta di almeno 10 punti il percentile del saldo nella fascia
-- solo per aver acceso o rimborsato un mutuo.
--
-- Incassi e pagamenti totali restano com'erano (sono movimenti di cassa veri e
-- il dettaglio per voce deve tornare coi pagamenti). Cambia solo il saldo che
-- alimenta il rango; l'avanzo mostrato resta quello di cassa.
-- ============================================================
alter table budget_records
  add column if not exists loans_in  numeric(15,2),  -- accensione di prestiti (titolo 6 delle entrate)
  add column if not exists loans_out numeric(15,2);  -- rimborso di prestiti (titolo 4 delle spese)

-- NULL se uno dei due prestiti non e' noto: meglio nessun dato che un dato storto
alter table budget_records
  add column if not exists surplus_gestione numeric(15,2)
  generated always as (
    case when loans_in is not null and loans_out is not null
         then surplus_deficit - loans_in + loans_out end
  ) stored;

create or replace function refresh_fhi(p_year int default null)
returns int language plpgsql volatile as $$
declare n int;
begin
  with base as (
    select b.id, b.year, fascia_demografica(b.population) as fascia,
           case when b.revenue_current > 0
                then b.own_revenue / b.revenue_current end as autonomia,
           -- Saldo di GESTIONE: senza accensione di prestiti (incassi) e senza
           -- rimborso di prestiti (pagamenti). Un mutuo acceso nell'anno non e'
           -- un risultato, e nemmeno la rata che si restituisce. Dove i prestiti
           -- non sono noti si ricade sul saldo di cassa intero.
           case when b.revenue_total - coalesce(b.loans_in, 0) > 0
                then coalesce(b.surplus_gestione, b.surplus_deficit)
                     / (b.revenue_total - coalesce(b.loans_in, 0)) end as saldo
    from budget_records b
    where p_year is null or b.year = p_year
  ),
  -- Le classifiche escludono i NULL, così un dato mancante non finisce
  -- in fondo alla graduatoria facendo sembrare pessimo chi non l'ha
  rank_autonomia as (
    select id, percent_rank() over (partition by year, fascia order by autonomia) as r
    from base where autonomia is not null
  ),
  rank_saldo as (
    select id, percent_rank() over (partition by year, fascia order by saldo) as r
    from base where saldo is not null
  ),
  composito as (
    select b.id, b.year, b.fascia,
           case
             when a.r is not null and s.r is not null then 0.5 * a.r + 0.5 * s.r
             when a.r is not null then a.r
             when s.r is not null then s.r
           end as grezzo
    from base b
    left join rank_autonomia a on a.id = b.id
    left join rank_saldo     s on s.id = b.id
  ),
  -- Rango finale sul composito: la media di due percentili NON è un
  -- percentile (viene a campana, e "90" non vorrebbe dire "meglio del 90%").
  -- Riclassificando, il punteggio torna a significare esattamente quello.
  classifica as (
    select id,
           round(100 * percent_rank() over (partition by year, fascia order by grezzo))::int as punteggio
    from composito
    where grezzo is not null
  )
  update budget_records b
     set financial_health_score = classifica.punteggio
    from classifica
   where classifica.id = b.id
     and b.financial_health_score is distinct from classifica.punteggio;
  get diagnostics n = row_count;
  return n;
end $$;

comment on function refresh_fhi(int) is
  'Ricalcola financial_health_score come percentile nella fascia demografica (autonomia + saldo di gestione al netto dei prestiti). Va lanciata dopo ogni import.';
