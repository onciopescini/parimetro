-- ============================================================
-- L'indice diventa la POSIZIONE NELLA FASCIA DEMOGRAFICA.
--
-- Perché: con i dati di cassa SIOPE due dei quattro termini di compute_fhi()
-- (debito e velocità di spesa) sono NULL su tutti i comuni e contribuiscono
-- il valore neutro previsto. Risultato: 25 punti su 100 fissi e punteggi
-- schiacciati tra 50 e 90. Un indice che non separa non è un indice.
--
-- Ora il punteggio è il percentile del comune fra quelli della SUA fascia
-- demografica, su due componenti che con SIOPE esistono davvero:
--   · autonomia finanziaria = entrate proprie / entrate correnti  (peso 50%)
--   · saldo di cassa        = avanzo / entrate totali             (peso 50%)
-- Se una delle due manca, il peso si ridistribuisce sull'altra invece di
-- iniettare un valore neutro fittizio.
--
-- ⚠ CAMBIA IL SIGNIFICATO: 0-100 non è più "salute assoluta" ma "quanto sei
-- messo meglio dei comuni della tua taglia". In una fascia dove stanno tutti
-- male, qualcuno segna comunque 100. Va detto nell'interfaccia.
--
-- Il calcolo è per coorte, quindi non può stare in un trigger di riga: il
-- trigger set_fhi viene rimosso e il punteggio si ricalcola con refresh_fhi()
-- alla fine di ogni import (vedi 04_import_siope.py).
-- ============================================================

drop trigger if exists set_fhi on budget_records;

create or replace function refresh_fhi(p_year int default null)
returns int language plpgsql volatile as $$
declare n int;
begin
  with base as (
    select b.id, b.year, fascia_demografica(b.population) as fascia,
           case when b.revenue_current > 0
                then b.own_revenue / b.revenue_current end as autonomia,
           case when b.revenue_total > 0
                then b.surplus_deficit / b.revenue_total end as saldo
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
  'Ricalcola financial_health_score come percentile nella fascia demografica. Va lanciata dopo ogni import: non c''è più un trigger di riga.';
