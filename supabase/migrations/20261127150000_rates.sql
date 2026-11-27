-- Wave 3: rates and direct booking (docs/pms/features.md, module 10). Direct and Airbnb only.
-- One price calculation, public.quote(), used by the PMS ("price check") and the website ("Book direct"),
-- so both always agree. Prices include VAT. Website requests don't block dates: the family accepts them in
-- the PMS, which turns them into bookings. Card payment comes later with Stripe.

-- Per villa: base prices, fees, stay rules, gap nights, and whether the website may take requests.
create table public.pricing (
  property_id uuid primary key references public.properties (id),
  base_price numeric(10, 2) not null default 0 check (base_price >= 0),
  -- Friday and Saturday nights; null = the base price.
  weekend_price numeric(10, 2) check (weekend_price is null or weekend_price >= 0),
  min_nights integer not null default 3 check (min_nights between 1 and 30),
  -- The nightly price covers this many guests; each one more pays extra_guest_fee per night.
  included_guests integer not null default 2 check (included_guests >= 1),
  extra_guest_fee numeric(10, 2) not null default 0 check (extra_guest_fee >= 0),
  cleaning_fee numeric(10, 2) not null default 0 check (cleaning_fee >= 0),
  -- Bookable from this many days ahead (0 = today) up to this many days ahead.
  min_advance_days integer not null default 1 check (min_advance_days between 0 and 60),
  max_advance_days integer not null default 540 check (max_advance_days between 30 and 1095),
  -- Gap nights: a free stretch of at most gap_max_nights between two bookings can be booked with
  -- gap_min_nights as the minimum stay and gap_discount_pct off. 0 = rule off.
  gap_max_nights integer not null default 0 check (gap_max_nights between 0 and 14),
  gap_min_nights integer not null default 1 check (gap_min_nights >= 1),
  gap_discount_pct numeric(5, 2) not null default 0 check (gap_discount_pct between 0 and 90),
  direct_booking_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.pricing (property_id) select id from public.properties where deleted_at is null;

-- Seasons: nights from starts to ends (both included). Where seasons overlap, the shorter one wins
-- (Easter week inside spring).
create table public.rate_seasons (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id),
  name text not null default '',
  starts date not null,
  ends date not null,
  price numeric(10, 2) not null check (price >= 0),
  weekend_price numeric(10, 2) check (weekend_price is null or weekend_price >= 0),
  min_nights integer check (min_nights is null or min_nights between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint rate_seasons_dates_check check (ends >= starts)
);
create index rate_seasons_property_idx on public.rate_seasons (property_id, starts);

-- Rate types offered next to the standard price, switching on by themselves by how far ahead the stay is.
create table public.rate_plans (
  id uuid primary key default gen_random_uuid(),
  -- Null: both villas.
  property_id uuid references public.properties (id),
  kind text not null check (kind in ('early_bird', 'last_minute', 'non_refundable', 'custom')),
  name jsonb not null default '{}',
  discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 90),
  -- Offered only when the arrival is at least / at most this many days away.
  min_days_ahead integer check (min_days_ahead is null or min_days_ahead >= 0),
  max_days_ahead integer check (max_days_ahead is null or max_days_ahead >= 0),
  refundable boolean not null default true,
  active boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index rate_plans_property_id_idx on public.rate_plans (property_id);
insert into public.rate_plans (kind, name, discount_pct, min_days_ahead, max_days_ahead, refundable, sort) values
  ('early_bird', '{"es": "Reserva anticipada", "en": "Early bird", "fr": "Réservation anticipée"}', 10, 90, null, true, 1),
  ('last_minute', '{"es": "Última hora", "en": "Last minute", "fr": "Dernière minute"}', 10, null, 14, true, 2),
  ('non_refundable', '{"es": "No reembolsable", "en": "Non-refundable", "fr": "Non remboursable"}', 8, null, null, false, 3);

create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code = upper(code) and length(code) between 3 and 30),
  property_id uuid references public.properties (id),
  discount_pct numeric(5, 2) not null check (discount_pct > 0 and discount_pct <= 90),
  valid_from date,
  valid_to date,
  max_uses integer check (max_uses is null or max_uses > 0),
  used integer not null default 0,
  active boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index promo_codes_code_idx on public.promo_codes (code) where deleted_at is null;
create index promo_codes_property_id_idx on public.promo_codes (property_id);

-- Requests from the website's "Book direct" form, waiting for the family.
create type public.request_status as enum ('new', 'accepted', 'declined');
create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id),
  check_in date not null,
  check_out date not null,
  adults integer not null check (adults between 1 and 30),
  children integer not null default 0 check (children between 0 and 30),
  plan text not null default 'standard',
  promo_code text,
  -- The price as shown to the guest when they asked.
  quote jsonb not null,
  total numeric(10, 2) not null,
  name text not null check (length(trim(name)) between 2 and 120),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  phone text not null default '' check (length(phone) <= 40),
  message text not null default '' check (length(message) <= 2000),
  language text not null default 'en' check (language in ('es', 'en', 'fr')),
  status public.request_status not null default 'new',
  reservation_id uuid references public.reservations (id),
  handled_by uuid references auth.users (id),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint booking_requests_dates_check check (check_out > check_in)
);
create index booking_requests_property_id_idx on public.booking_requests (property_id);
create index booking_requests_reservation_id_idx on public.booking_requests (reservation_id);
create index booking_requests_handled_by_idx on public.booking_requests (handled_by);
create index booking_requests_new_idx on public.booking_requests (created_at) where status = 'new';

create trigger pricing_updated_at before update on public.pricing for each row execute function public.set_updated_at();
create trigger rate_seasons_updated_at before update on public.rate_seasons for each row execute function public.set_updated_at();
create trigger rate_plans_updated_at before update on public.rate_plans for each row execute function public.set_updated_at();
create trigger promo_codes_updated_at before update on public.promo_codes for each row execute function public.set_updated_at();

alter table public.pricing enable row level security;
alter table public.rate_seasons enable row level security;
alter table public.rate_plans enable row level security;
alter table public.promo_codes enable row level security;
alter table public.booking_requests enable row level security;
create policy "managers manage pricing" on public.pricing for all to authenticated
  using ((select private.my_role()) in ('owner', 'manager')) with check ((select private.my_role()) in ('owner', 'manager'));
create policy "managers manage seasons" on public.rate_seasons for all to authenticated
  using ((select private.my_role()) in ('owner', 'manager')) with check ((select private.my_role()) in ('owner', 'manager'));
create policy "managers manage rate plans" on public.rate_plans for all to authenticated
  using ((select private.my_role()) in ('owner', 'manager')) with check ((select private.my_role()) in ('owner', 'manager'));
create policy "managers manage promo codes" on public.promo_codes for all to authenticated
  using ((select private.my_role()) in ('owner', 'manager')) with check ((select private.my_role()) in ('owner', 'manager'));
create policy "managers read requests" on public.booking_requests for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy "managers update requests" on public.booking_requests for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager')) with check ((select private.my_role()) in ('owner', 'manager'));
alter publication supabase_realtime add table public.booking_requests;

-- The price of a stay, with every rule applied. Called by the website (anyone, only for villas open to
-- direct booking) and the PMS (owners and managers, always). p_villa is the villa's slug or id.
create function public.quote(p_villa text, p_check_in date, p_check_out date, p_guests integer, p_promo text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  staff boolean := coalesce(private.my_role() in ('owner', 'manager'), false);
  today date := (now() at time zone 'Europe/Madrid')::date;
  prop public.properties;
  pr public.pricing;
  units uuid[];
  cap integer;
  nights integer := p_check_out - p_check_in;
  d date;
  s public.rate_seasons;
  night_price numeric;
  acc numeric := 0;
  per_night jsonb := '[]';
  min_n integer := 1;
  prev_out date;
  next_in date;
  gap boolean := false;
  extra numeric;
  promo public.promo_codes;
  promo_pct numeric := 0;
  base_total numeric;
  options jsonb;
  pl public.rate_plans;
  ahead integer := p_check_in - today;
  fail jsonb;
begin
  select * into prop from public.properties where (slug = p_villa or id::text = p_villa) and deleted_at is null;
  if prop.id is null then return jsonb_build_object('available', false, 'reason', 'unknown_villa'); end if;
  select * into pr from public.pricing where property_id = prop.id;
  if pr.property_id is null or (not pr.direct_booking_enabled and not staff) then
    return jsonb_build_object('available', false, 'reason', 'not_bookable');
  end if;
  select array_agg(id), coalesce(sum(capacity), 0) into units, cap from public.units where property_id = prop.id and active and deleted_at is null;
  fail := jsonb_build_object('available', false, 'villa', prop.name, 'max_guests', cap);

  if p_check_in is null or p_check_out is null or nights < 1 or nights > 60 then return fail || '{"reason": "bad_dates"}'; end if;
  if ahead < pr.min_advance_days then return fail || jsonb_build_object('reason', 'too_soon', 'min_advance_days', pr.min_advance_days); end if;
  if ahead > pr.max_advance_days then return fail || '{"reason": "too_far"}'; end if;
  if p_guests is null or p_guests < 1 or p_guests > cap then return fail || '{"reason": "too_many_guests"}'; end if;
  if exists (
    select 1 from public.reservations r
    where r.unit_id = any (units) and r.deleted_at is null and r.status <> 'cancelled' and r.stay && daterange(p_check_in, p_check_out, '[)')
  ) then
    return fail || '{"reason": "unavailable"}';
  end if;

  -- Is the stay inside a short gap between two bookings?
  select max(check_out) into prev_out from public.reservations
    where unit_id = any (units) and deleted_at is null and status <> 'cancelled' and check_out <= p_check_in;
  select min(check_in) into next_in from public.reservations
    where unit_id = any (units) and deleted_at is null and status <> 'cancelled' and check_in >= p_check_out;
  gap := pr.gap_max_nights > 0 and prev_out is not null and next_in is not null and next_in - prev_out <= pr.gap_max_nights;

  for d in select generate_series(p_check_in, p_check_out - 1, interval '1 day')::date loop
    s := null;
    select * into s from public.rate_seasons
      where property_id = prop.id and deleted_at is null and d between starts and ends
      order by ends - starts, created_at desc limit 1;
    -- Friday and Saturday nights are the weekend.
    night_price := case when extract(isodow from d) in (5, 6)
      then coalesce(s.weekend_price, s.price, pr.weekend_price, pr.base_price)
      else coalesce(s.price, pr.base_price) end;
    min_n := greatest(min_n, coalesce(s.min_nights, pr.min_nights));
    acc := acc + night_price;
    per_night := per_night || jsonb_build_object('date', d, 'price', night_price);
  end loop;
  if gap then
    min_n := least(min_n, pr.gap_min_nights);
    acc := round(acc * (1 - pr.gap_discount_pct / 100), 2);
  end if;
  if nights < min_n then return fail || jsonb_build_object('reason', 'min_nights', 'min_nights', min_n); end if;
  if acc <= 0 then return fail || '{"reason": "no_price"}'; end if;

  extra := greatest(0, p_guests - pr.included_guests) * pr.extra_guest_fee * nights;

  if nullif(trim(p_promo), '') is not null then
    select * into promo from public.promo_codes
      where code = upper(trim(p_promo)) and active and deleted_at is null
        and (property_id is null or property_id = prop.id)
        and (valid_from is null or today >= valid_from) and (valid_to is null or today <= valid_to)
        and (max_uses is null or used < max_uses);
    promo_pct := coalesce(promo.discount_pct, 0);
  end if;

  base_total := round((acc + extra) * (1 - promo_pct / 100), 2);
  options := jsonb_build_array(jsonb_build_object(
    'plan', 'standard', 'kind', 'standard', 'name', '{}'::jsonb, 'discount_pct', 0, 'refundable', true,
    'total', base_total + pr.cleaning_fee));
  for pl in
    select * from public.rate_plans
    where active and deleted_at is null and (property_id is null or property_id = prop.id)
      and (min_days_ahead is null or ahead >= min_days_ahead)
      and (max_days_ahead is null or ahead <= max_days_ahead)
    order by sort
  loop
    options := options || jsonb_build_object(
      'plan', pl.id, 'kind', pl.kind, 'name', pl.name, 'discount_pct', pl.discount_pct, 'refundable', pl.refundable,
      'total', round((acc + extra) * (1 - pl.discount_pct / 100) * (1 - promo_pct / 100), 2) + pr.cleaning_fee);
  end loop;

  return jsonb_build_object(
    'available', true,
    'villa', prop.name,
    'max_guests', cap,
    'check_in', p_check_in,
    'check_out', p_check_out,
    'check_in_time', to_char(prop.check_in_time, 'HH24:MI'),
    'check_out_time', to_char(prop.check_out_time, 'HH24:MI'),
    'nights', nights,
    'guests', p_guests,
    'per_night', per_night,
    'accommodation', acc,
    'gap', gap,
    'gap_discount_pct', case when gap then pr.gap_discount_pct else 0 end,
    'extra_guests', extra,
    'cleaning', pr.cleaning_fee,
    'promo', case when promo.id is null then null else jsonb_build_object('code', promo.code, 'discount_pct', promo.discount_pct) end,
    'promo_invalid', nullif(trim(p_promo), '') is not null and promo.id is null,
    'options', options
  );
end;
$$;

-- Nights already taken (for greying out the website's date picker), for villas open to direct booking.
create function public.busy_nights(p_villa text, p_from date, p_to date) returns setof date
language sql stable security definer set search_path = '' as $$
  select distinct g::date
  from public.properties p
  join public.pricing pr on pr.property_id = p.id and (pr.direct_booking_enabled or coalesce(private.my_role() in ('owner', 'manager'), false))
  join public.units u on u.property_id = p.id and u.deleted_at is null
  join public.reservations r on r.unit_id = u.id and r.deleted_at is null and r.status <> 'cancelled'
  cross join lateral generate_series(greatest(r.check_in, p_from), least(r.check_out - 1, p_to), interval '1 day') g
  where (p.slug = p_villa or p.id::text = p_villa) and p_to - p_from <= 400
  order by 1;
$$;

-- The website's "Book direct" form. The price is recalculated here, never taken from the browser.
create function public.request_booking(
  p_villa text, p_check_in date, p_check_out date, p_adults integer, p_children integer, p_plan text,
  p_promo text, p_name text, p_email text, p_phone text, p_message text, p_language text
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  q jsonb := public.quote(p_villa, p_check_in, p_check_out, coalesce(p_adults, 0) + coalesce(p_children, 0), p_promo);
  chosen jsonb;
  prop_id uuid;
  req_id uuid;
begin
  if not (q ->> 'available')::boolean then return jsonb_build_object('ok', false, 'reason', q ->> 'reason'); end if;
  select o into chosen from jsonb_array_elements(q -> 'options') o where o ->> 'plan' = coalesce(nullif(p_plan, ''), 'standard');
  if chosen is null then return jsonb_build_object('ok', false, 'reason', 'plan'); end if;
  -- A little protection against floods: 3 open requests per email, 40 a day in all.
  if (select count(*) from public.booking_requests where lower(email) = lower(trim(p_email)) and status = 'new') >= 3
     or (select count(*) from public.booking_requests where created_at > now() - interval '1 day') >= 40 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  select id into prop_id from public.properties where slug = p_villa or id::text = p_villa;
  insert into public.booking_requests (property_id, check_in, check_out, adults, children, plan, promo_code, quote, total, name, email, phone, message, language)
  values (prop_id, p_check_in, p_check_out, p_adults, coalesce(p_children, 0), chosen ->> 'plan', (q -> 'promo') ->> 'code', q,
          (chosen ->> 'total')::numeric, trim(p_name), lower(trim(p_email)), coalesce(trim(p_phone), ''), coalesce(p_message, ''),
          case when p_language in ('es', 'en', 'fr') then p_language else 'en' end)
  returning id into req_id;
  return jsonb_build_object('ok', true, 'id', req_id, 'total', chosen -> 'total');
exception when check_violation then
  return jsonb_build_object('ok', false, 'reason', 'invalid');
end;
$$;

-- In the PMS: accept a request. Creates the guest and the booking (an option until the family confirms it)
-- in one go; refused if the dates were taken in the meantime.
create function public.accept_booking_request(p_id uuid, p_status public.reservation_status default 'option') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.booking_requests;
  unit uuid;
  guest uuid;
  res uuid;
begin
  if private.my_role() not in ('owner', 'manager') then raise exception 'forbidden'; end if;
  select * into r from public.booking_requests where id = p_id and status = 'new' for update;
  if r.id is null then raise exception 'not_found'; end if;
  select id into unit from public.units where property_id = r.property_id and active and deleted_at is null order by sort limit 1;
  insert into public.guests (first_name, last_name, email, phone, language)
  values (split_part(r.name, ' ', 1), trim(substr(r.name, length(split_part(r.name, ' ', 1)) + 1)), r.email, nullif(r.phone, ''), r.language)
  returning id into guest;
  insert into public.reservations (unit_id, guest_id, kind, status, source, check_in, check_out, adults, children, total_amount, notes)
  values (unit, guest, 'booking', p_status, 'direct', r.check_in, r.check_out, r.adults, r.children, r.total,
          concat_ws(E'\n', 'Website request · ' || r.plan || coalesce(' · ' || r.promo_code, ''), nullif(r.message, '')))
  returning id into res;
  update public.booking_requests set status = 'accepted', reservation_id = res, handled_by = auth.uid(), handled_at = now() where id = r.id;
  if r.promo_code is not null then update public.promo_codes set used = used + 1 where code = r.promo_code and deleted_at is null; end if;
  return res;
exception when exclusion_violation then
  raise exception 'unavailable';
end;
$$;

revoke execute on function public.quote(text, date, date, integer, text), public.busy_nights(text, date, date),
  public.request_booking(text, date, date, integer, integer, text, text, text, text, text, text, text),
  public.accept_booking_request(uuid, public.reservation_status) from public;
grant execute on function public.quote(text, date, date, integer, text), public.busy_nights(text, date, date),
  public.request_booking(text, date, date, integer, integer, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.accept_booking_request(uuid, public.reservation_status) to authenticated;
