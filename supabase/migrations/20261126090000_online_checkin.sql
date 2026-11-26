-- Wave 2: online check-in. Each booking can get a private link (an unguessable token). Through it the
-- guest — who has no account — fills in every traveller's registration data (RD 933/2021,
-- SES.Hospedajes), accepts the house rules and signs. The guest page only talks to the database through
-- the two functions at the bottom, which look everything up by token.
-- Registration data is deleted automatically 3 years after departure.

create extension if not exists pg_cron;

-- What guests see about each villa: Wi-Fi, directions, house rules… in English, Spanish and French.
create type public.guide_kind as enum ('wifi', 'directions', 'rules', 'info');

create table public.guide_items (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id),
  kind public.guide_kind not null default 'info',
  title jsonb not null default '{}', -- {"en": "...", "es": "...", "fr": "..."}
  body jsonb not null default '{}',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index guide_items_property_id_idx on public.guide_items (property_id);

create type public.checkin_status as enum ('pending', 'complete');

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations (id),
  token text not null unique default translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_'),
  status public.checkin_status not null default 'pending',
  arrival_time text not null default '',
  rules_accepted_at timestamptz,
  signature text, -- PNG data URL of the signature
  guest_language text,
  invoice_name text not null default '',
  invoice_tax_id text not null default '',
  invoice_address text not null default '',
  completed_at timestamptz,
  ses_sent_at timestamptz,
  ses_sent_by uuid references auth.users (id),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index checkins_ses_sent_by_idx on public.checkins (ses_sent_by);
create index checkins_created_by_idx on public.checkins (created_by);

-- One row per traveller, with the fields SES.Hospedajes asks for.
create table public.travellers (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins (id) on delete cascade,
  ordinal integer not null default 1,
  first_name text not null,
  last_name_1 text not null,
  last_name_2 text not null default '',
  sex text not null default '' check (sex in ('', 'M', 'F', 'X')),
  birth_date date not null,
  nationality text not null default '', -- ISO 3166 alpha-3, e.g. ESP, FRA, GBR
  doc_type text not null default '' check (doc_type in ('', 'DNI', 'NIE', 'PASSPORT', 'ID_CARD', 'OTHER')),
  doc_number text not null default '',
  doc_support_number text not null default '', -- the "número de soporte" of Spanish DNI/NIE cards
  doc_issue_date date,
  residence_address text not null default '',
  residence_city text not null default '',
  residence_postal_code text not null default '',
  residence_country text not null default '',
  phone text not null default '',
  email text not null default '',
  relationship text not null default '', -- for minors: relationship to the adult responsible
  created_at timestamptz not null default now()
);
create index travellers_checkin_id_idx on public.travellers (checkin_id);

create trigger guide_items_updated_at before update on public.guide_items for each row execute function public.set_updated_at();
create trigger checkins_updated_at before update on public.checkins for each row execute function public.set_updated_at();

alter table public.guide_items enable row level security;
alter table public.checkins enable row level security;
alter table public.travellers enable row level security;

create policy "team reads guide" on public.guide_items for select to authenticated
  using ((select private.my_role()) is not null);
create policy "managers insert guide" on public.guide_items for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy "managers update guide" on public.guide_items for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager'));

-- Registration (identity) data: owners and managers only.
create policy "managers read checkins" on public.checkins for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy "managers insert checkins" on public.checkins for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy "managers update checkins" on public.checkins for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy "managers read travellers" on public.travellers for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy "managers delete travellers" on public.travellers for delete to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));

alter publication supabase_realtime add table public.checkins;

-- ---------- The guest page's only doors into the database ----------

-- What the guest page needs for a token: the booking summary, and the villa guide once checked in.
-- Never returns traveller data. Links stop working a week after departure.
create function public.checkin_get(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.checkins;
  r public.reservations;
  u public.units;
  p public.properties;
  g public.guests;
begin
  select * into c from public.checkins where token = p_token;
  if c.id is null then return null; end if;
  select * into r from public.reservations where id = c.reservation_id and deleted_at is null and status <> 'cancelled';
  if r.id is null or r.check_out + 7 < (now() at time zone 'Europe/Madrid')::date then return null; end if;
  select * into u from public.units where id = r.unit_id;
  select * into p from public.properties where id = u.property_id;
  select * into g from public.guests where id = r.guest_id;
  return jsonb_build_object(
    'status', c.status,
    'villa', p.name,
    'locality', p.locality,
    'check_in', r.check_in,
    'check_out', r.check_out,
    'check_in_time', to_char(p.check_in_time, 'HH24:MI'),
    'check_out_time', to_char(p.check_out_time, 'HH24:MI'),
    'adults', r.adults,
    'children', r.children,
    'guest_first_name', coalesce(g.first_name, ''),
    'rules', (select coalesce(jsonb_agg(jsonb_build_object('title', gi.title, 'body', gi.body) order by gi.sort), '[]')
              from public.guide_items gi where gi.property_id = p.id and gi.kind = 'rules' and gi.deleted_at is null),
    'guide', case when c.status = 'complete' then
              (select coalesce(jsonb_agg(jsonb_build_object('kind', gi.kind, 'title', gi.title, 'body', gi.body) order by gi.sort), '[]')
               from public.guide_items gi where gi.property_id = p.id and gi.kind <> 'rules' and gi.deleted_at is null)
             else null end
  );
end;
$$;

-- The guest submits the check-in: all travellers at once, then it's locked (the owners can still see it).
create function public.checkin_submit(p_token text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.checkins;
  t jsonb;
  n integer := 0;
begin
  select * into c from public.checkins where token = p_token for update;
  if c.id is null or public.checkin_get(p_token) is null then raise exception 'Invalid link' using errcode = 'P0002'; end if;
  if c.status = 'complete' then raise exception 'Already completed' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_data -> 'travellers') <> 'array' or jsonb_array_length(p_data -> 'travellers') = 0 then
    raise exception 'At least one traveller is required' using errcode = 'P0001';
  end if;
  if coalesce((p_data ->> 'rules_accepted')::boolean, false) is not true then
    raise exception 'The house rules must be accepted' using errcode = 'P0001';
  end if;
  if coalesce(p_data ->> 'signature', '') not like 'data:image/png;base64,%' or length(p_data ->> 'signature') > 300000 then
    raise exception 'A signature is required' using errcode = 'P0001';
  end if;

  for t in select * from jsonb_array_elements(p_data -> 'travellers') loop
    n := n + 1;
    if n > 30 then raise exception 'Too many travellers' using errcode = 'P0001'; end if;
    insert into public.travellers (checkin_id, ordinal, first_name, last_name_1, last_name_2, sex, birth_date, nationality,
      doc_type, doc_number, doc_support_number, doc_issue_date, residence_address, residence_city, residence_postal_code,
      residence_country, phone, email, relationship)
    values (c.id, n, left(trim(t ->> 'first_name'), 100), left(trim(t ->> 'last_name_1'), 100), left(trim(coalesce(t ->> 'last_name_2', '')), 100),
      coalesce(t ->> 'sex', ''), (t ->> 'birth_date')::date, left(coalesce(t ->> 'nationality', ''), 3),
      coalesce(t ->> 'doc_type', ''), left(upper(trim(coalesce(t ->> 'doc_number', ''))), 40), left(upper(trim(coalesce(t ->> 'doc_support_number', ''))), 40),
      nullif(t ->> 'doc_issue_date', '')::date, left(coalesce(t ->> 'residence_address', ''), 200), left(coalesce(t ->> 'residence_city', ''), 100),
      left(coalesce(t ->> 'residence_postal_code', ''), 20), left(coalesce(t ->> 'residence_country', ''), 3),
      left(coalesce(t ->> 'phone', ''), 40), left(coalesce(t ->> 'email', ''), 200), left(coalesce(t ->> 'relationship', ''), 40));
  end loop;

  update public.checkins set
    status = 'complete',
    arrival_time = left(coalesce(p_data ->> 'arrival_time', ''), 20),
    rules_accepted_at = now(),
    signature = p_data ->> 'signature',
    guest_language = left(coalesce(p_data ->> 'language', ''), 5),
    invoice_name = left(coalesce(p_data ->> 'invoice_name', ''), 200),
    invoice_tax_id = left(coalesce(p_data ->> 'invoice_tax_id', ''), 40),
    invoice_address = left(coalesce(p_data ->> 'invoice_address', ''), 300),
    completed_at = now()
  where id = c.id;
  return public.checkin_get(p_token);
end;
$$;

revoke execute on function public.checkin_get(text) from public;
revoke execute on function public.checkin_submit(text, jsonb) from public;
grant execute on function public.checkin_get(text) to anon, authenticated;
grant execute on function public.checkin_submit(text, jsonb) to anon, authenticated;

-- ---------- Retention ----------
-- Registration data is kept 3 years after departure (RD 933/2021), then deleted. Runs nightly.
create function private.purge_old_registrations() returns void
language sql security definer set search_path = '' as $$
  delete from public.travellers t using public.checkins c, public.reservations r
  where t.checkin_id = c.id and r.id = c.reservation_id and r.check_out < (now() at time zone 'Europe/Madrid')::date - interval '3 years';
  update public.checkins c set signature = null, invoice_tax_id = '', invoice_address = ''
  from public.reservations r
  where r.id = c.reservation_id and r.check_out < (now() at time zone 'Europe/Madrid')::date - interval '3 years' and c.signature is not null;
$$;
revoke execute on function private.purge_old_registrations() from public, anon, authenticated;
select cron.schedule('purge-old-registrations', '30 3 * * *', 'select private.purge_old_registrations()');

-- Starter guide for both villas, to edit in the PMS.
insert into public.guide_items (property_id, kind, title, body, sort)
select p.id, x.kind::public.guide_kind, x.title::jsonb, x.body::jsonb, x.sort
from public.properties p
cross join (values
  ('wifi', '{"en":"Wi-Fi","es":"Wi-Fi","fr":"Wi-Fi"}', '{"en":"Network: —\nPassword: —","es":"Red: —\nContraseña: —","fr":"Réseau : —\nMot de passe : —"}', 1),
  ('directions', '{"en":"Getting here","es":"Cómo llegar","fr":"Comment venir"}', '{"en":"","es":"","fr":""}', 2),
  ('rules', '{"en":"House rules","es":"Normas de la casa","fr":"Règlement intérieur"}',
    '{"en":"No parties or events without prior agreement.\nQuiet hours from 23:00 to 08:00.\nNo smoking indoors.\nPlease look after the pool area and follow the pool safety rules.","es":"No se permiten fiestas ni eventos sin acuerdo previo.\nHorario de descanso de 23:00 a 08:00.\nNo se puede fumar en el interior.\nCuidad la zona de piscina y respetad sus normas de seguridad.","fr":"Pas de fêtes ni d''événements sans accord préalable.\nSilence de 23h00 à 08h00.\nInterdiction de fumer à l''intérieur.\nMerci de prendre soin de l''espace piscine et de respecter ses règles de sécurité."}', 3)
) as x (kind, title, body, sort);
