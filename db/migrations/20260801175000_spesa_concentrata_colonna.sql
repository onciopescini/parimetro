-- Quanto pesa la voce di spesa piu' grande sul totale dei pagamenti, in %.
-- Serve a riconoscere gli anni in cui un comune ha speso quasi tutto in una cosa
-- sola (un immobile, una ricostruzione): il pro capite di quell'anno non e'
-- confrontabile con quello dei vicini. Si riempie con refresh_concentrazione().
alter table budget_records add column if not exists quota_voce_max numeric(5,1);
