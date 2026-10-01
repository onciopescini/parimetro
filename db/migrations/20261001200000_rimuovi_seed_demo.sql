-- Toglie i tre comuni fittizi del vecchio seed (DEMO001-003): comparivano
-- nell'anno 2025 e nella mappa. I bilanci si cancellano a cascata.
delete from municipalities where istat_code like 'DEMO%';
