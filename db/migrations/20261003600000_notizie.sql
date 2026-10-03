-- Notizie sui conti dei comuni: SOLO titolo, fonte, data e link. Nessun testo dell'articolo e nessun
-- riassunto: il sito rimanda alla testata. La scelta di cosa sia pertinente la fa etl/notizie.py.

create table if not exists notizie_comuni (
  istat     varchar(10) not null,
  url       text        not null,
  titolo    text        not null,
  fonte     text        not null,
  data      date        not null,
  primary key (istat, url)
);
create index if not exists idx_notizie_comuni_istat_data on notizie_comuni (istat, data desc);

-- Quando si e' cercato per l'ultima volta: distingue "nessuna notizia" da "non ho ancora cercato"
create table if not exists notizie_raccolte (
  istat       varchar(10) primary key,
  raccolta_il date        not null,
  trovate     int         not null default 0
);

-- La scheda delle notizie di un comune. Null se non si e' mai cercato (il sito non mostra nulla),
-- con elenco vuoto se si e' cercato e non c'e' niente.
create or replace function get_notizie_comune(p_istat text)
returns jsonb language sql stable as $$
  select case when r.istat is null then null else jsonb_build_object(
    'raccolta_il', r.raccolta_il,
    'notizie', coalesce((
      select jsonb_agg(jsonb_build_object('titolo', n.titolo, 'fonte', n.fonte, 'data', n.data, 'url', n.url)
                       order by n.data desc, n.url)
      from (select * from notizie_comuni where istat = p_istat order by data desc, url limit 8) n
    ), '[]'::jsonb)
  ) end
  from (select p_istat as istat) q
  left join notizie_raccolte r on r.istat = q.istat
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'mappa_ro') then
    grant select on notizie_comuni, notizie_raccolte to mappa_ro;
    grant execute on function get_notizie_comune(text) to mappa_ro;
  end if;
end $$;
