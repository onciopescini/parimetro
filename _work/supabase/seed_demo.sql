-- ============================================================================
-- SEED DEMO · 8 comuni fittizi con poligoni semplificati e bilanci 2018–2026
-- Serve solo per vedere subito la mappa funzionare: sostituiscilo con la
-- pipeline ETL reale (ISTAT + OpenBDAP) descritta nel README.
-- Esegui DOPO schema.sql.
-- ============================================================================

insert into municipalities (istat_code, name, region, province, population, area_sqkm, geom)
values
    ('015146', 'Milano Demo',   'Lombardia',      'Milano',  1350000, 181.67,
        st_multi(st_makeenvelope(9.10, 45.42, 9.28, 45.53, 4326))),
    ('016024', 'Bergamo Demo',  'Lombardia',      'Bergamo',  120000,  40.16,
        st_multi(st_makeenvelope(9.62, 45.66, 9.72, 45.72, 4326))),
    ('001272', 'Torino Demo',   'Piemonte',       'Torino',   850000, 130.01,
        st_multi(st_makeenvelope(7.60, 45.00, 7.74, 45.11, 4326))),
    ('037006', 'Bologna Demo',  'Emilia-Romagna', 'Bologna',  390000, 140.86,
        st_multi(st_makeenvelope(11.28, 44.46, 11.40, 44.54, 4326))),
    ('058091', 'Roma Demo',     'Lazio',          'Roma',    2750000, 1287.36,
        st_multi(st_makeenvelope(12.38, 41.80, 12.62, 41.99, 4326))),
    ('063049', 'Napoli Demo',   'Campania',       'Napoli',   910000, 119.02,
        st_multi(st_makeenvelope(14.18, 40.82, 14.32, 40.90, 4326))),
    ('082053', 'Palermo Demo',  'Sicilia',        'Palermo',  630000, 160.59,
        st_multi(st_makeenvelope(13.28, 38.06, 13.42, 38.16, 4326))),
    ('027042', 'Venezia Demo',  'Veneto',         'Venezia',  250000, 415.90,
        st_multi(st_makeenvelope(12.27, 45.40, 12.42, 45.50, 4326)))
on conflict (istat_code) do nothing;

-- Bilanci 2018–2026 con trend e rumore casuale (valori € plausibili pro-capite)
insert into budget_records
    (municipality_id, year, population, revenue_total, expenditure_total, debt_total, surplus_deficit)
select
    m.id,
    y.year,
    -- lieve dinamica demografica
    round(m.population * (1 + (y.year - 2022) * 0.002))::int,
    -- entrate: ~1.400–2.600 €/ab con crescita e rumore
    round(m.population * (1400 + (m.population % 7) * 180) * (1 + (y.year - 2018) * 0.028 + random() * 0.06)),
    -- spese: leggermente sotto/ sopra le entrate a seconda del comune
    round(m.population * (1380 + (m.population % 5) * 210) * (1 + (y.year - 2018) * 0.030 + random() * 0.06)),
    -- debito: ~600–2.400 €/ab in lenta discesa
    round(m.population * ( 600 + (m.population % 9) * 200) * (1 - (y.year - 2018) * 0.015 + random() * 0.05)),
    -- avanzo/disavanzo: -80 … +140 €/ab
    round(m.population * ((random() * 220) - 80))
from municipalities m
cross join generate_series(2018, 2026) as y(year)
on conflict (municipality_id, year) do nothing;

-- Calcola il Financial Health Index per ogni anno e aggiorna le viste
select compute_financial_health(y) from generate_series(2018, 2026) y;
select refresh_stats();
