-- Quotes (docs/pms/features.md, module 8): for website requests, phone and email enquiries, the family sends a priced
-- quote with a private link (/q/<token>). The quote holds the dates as an *option* booking until it expires
-- (company_settings.quote_valid_days, 3 by default). The guest accepts or declines on the page; after accepting
-- they see how to pay the deposit by bank transfer (company_settings.bank_details, typed in by an owner), and the
-- family confirms the booking when the money arrives. Expired or declined quotes free the dates.

alter type public.request_status add value if not exists 'quoted';

alter table public.company_settings
  -- Shown to guests after they accept a quote: account holder, IBAN, bank. Entered by an owner.
  add column bank_details text not null default '',
  add column quote_valid_days integer not null default 3 check (quote_valid_days between 1 and 30);

create type public.quote_status as enum ('sent', 'accepted', 'declined', 'expired', 'cancelled');

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_'),
  reservation_id uuid not null unique references public.reservations (id),
  request_id uuid references public.booking_requests (id),
  language text not null default 'en' check (language in ('es', 'en', 'fr')),
  -- The rate chosen ('standard' or a rate plan id), its name and terms, and the price calculation shown.
  plan text not null default 'standard',
  plan_name jsonb not null default '{}',
  refundable boolean not null default true,
  breakdown jsonb not null default '{}',
  total numeric(10, 2) not null check (total > 0),
  deposit numeric(10, 2) not null check (deposit >= 0),
  message text not null default '' check (length(message) <= 2000),
  valid_until timestamptz not null,
  status public.quote_status not null default 'sent',
  responded_at timestamptz,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quotes_request_id_idx on public.quotes (request_id);
create index quotes_created_by_idx on public.quotes (created_by);
create index quotes_open_idx on public.quotes (valid_until) where status in ('sent', 'accepted');
create trigger quotes_updated_at before update on public.quotes for each row execute function public.set_updated_at();

alter table public.quotes enable row level security;
create policy "managers manage quotes" on public.quotes for all to authenticated
  using ((select private.is_manager())) with check ((select private.is_manager()));
revoke all on public.quotes from anon;

-- Create a quote in one go: the guest (new, or an existing one), the option booking holding the dates, the quote,
-- and, when it answers a website request, the request marked as quoted. Owners and managers only.
create function public.create_quote(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  co public.company_settings;
  g uuid := nullif(p ->> 'guest_id', '')::uuid;
  r uuid;
  q public.quotes;
  days integer;
begin
  if not private.is_manager() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into co from public.company_settings;
  days := coalesce(nullif(p ->> 'valid_days', '')::integer, co.quote_valid_days);
  if g is null then
    insert into public.guests (first_name, last_name, email, phone, language)
    values (left(trim(coalesce(p ->> 'first_name', '')), 100), left(trim(coalesce(p ->> 'last_name', '')), 100),
            nullif(trim(coalesce(p ->> 'email', '')), ''), nullif(trim(coalesce(p ->> 'phone', '')), ''), coalesce(p ->> 'language', 'en'))
    returning id into g;
  end if;
  -- The option booking: the overlap constraint refuses it if the dates are taken.
  insert into public.reservations (unit_id, guest_id, kind, status, source, check_in, check_out, adults, children, total_amount, notes)
  values ((p ->> 'unit_id')::uuid, g, 'booking', 'option', coalesce(nullif(p ->> 'source', ''), 'direct')::public.reservation_source,
          (p ->> 'check_in')::date, (p ->> 'check_out')::date, coalesce((p ->> 'adults')::integer, 1), coalesce((p ->> 'children')::integer, 0),
          (p ->> 'total')::numeric, 'Presupuesto / quote')
  returning id into r;
  insert into public.quotes (reservation_id, request_id, language, plan, plan_name, refundable, breakdown, total, deposit, message, valid_until)
  values (r, nullif(p ->> 'request_id', '')::uuid, coalesce(p ->> 'language', 'en'), coalesce(p ->> 'plan', 'standard'),
          coalesce(p -> 'plan_name', '{}'), coalesce((p ->> 'refundable')::boolean, true), coalesce(p -> 'breakdown', '{}'),
          (p ->> 'total')::numeric, coalesce((p ->> 'deposit')::numeric, 0), left(coalesce(p ->> 'message', ''), 2000),
          now() + make_interval(days => greatest(1, least(days, 30))))
  returning * into q;
  if q.request_id is not null then
    update public.booking_requests set status = 'quoted', reservation_id = r, handled_by = auth.uid(), handled_at = now() where id = q.request_id;
  end if;
  return jsonb_build_object('quote_id', q.id, 'token', q.token, 'reservation_id', r);
end;
$$;
revoke execute on function public.create_quote(jsonb) from public, anon;
grant execute on function public.create_quote(jsonb) to authenticated;

-- The guest's quote page (/q/<token>): no sign-in, the token is the key. Bank details only once accepted.
create function public.quote_page(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'status', case when q.status = 'sent' and q.valid_until < now() then 'expired' else q.status::text end,
    'language', q.language,
    'guest', g.first_name,
    'villa', pr.name,
    'unit', u.name,
    'check_in', r.check_in,
    'check_out', r.check_out,
    'check_in_time', to_char(pr.check_in_time, 'HH24:MI'),
    'check_out_time', to_char(pr.check_out_time, 'HH24:MI'),
    'adults', r.adults,
    'children', r.children,
    'plan_name', q.plan_name,
    'refundable', q.refundable,
    'breakdown', q.breakdown - 'per_night' - 'options',
    'total', q.total,
    'deposit', q.deposit,
    'balance_due', r.check_in - coalesce(p.balance_days_before, 30),
    'message', q.message,
    'valid_until', q.valid_until,
    'company', co.legal_name,
    'contact_email', co.email,
    'contact_phone', co.phone,
    'bank_details', case when q.status = 'accepted' then co.bank_details end
  )
  from public.quotes q
  join public.reservations r on r.id = q.reservation_id
  join public.units u on u.id = r.unit_id
  join public.properties pr on pr.id = u.property_id
  left join public.pricing p on p.property_id = pr.id
  left join public.guests g on g.id = r.guest_id
  cross join public.company_settings co
  where q.token = p_token;
$$;

-- The guest accepts or declines. Accepting keeps the option until the family confirms the payment; declining frees
-- the dates. Only an open, unexpired quote can be answered.
create function public.quote_respond(p_token text, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q public.quotes;
begin
  select * into q from public.quotes where token = p_token for update;
  if q.id is null then raise exception 'Invalid link' using errcode = 'P0002'; end if;
  if q.status <> 'sent' or q.valid_until < now() then raise exception 'This quote can no longer be answered' using errcode = 'P0001'; end if;
  update public.quotes set status = case when p_accept then 'accepted' else 'declined' end::public.quote_status, responded_at = now() where id = q.id;
  if not p_accept then
    update public.reservations set status = 'cancelled' where id = q.reservation_id and status = 'option';
  end if;
  return public.quote_page(p_token);
end;
$$;
revoke execute on function public.quote_page(text) from public;
revoke execute on function public.quote_respond(text, boolean) from public;
grant execute on function public.quote_page(text) to anon, authenticated;
grant execute on function public.quote_respond(text, boolean) to anon, authenticated;

-- The booking cancelled in the PMS: its open quote goes with it.
create function private.quote_follows_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' or new.deleted_at is not null then
    update public.quotes set status = 'cancelled' where reservation_id = new.id and status in ('sent', 'accepted');
  end if;
  return new;
end;
$$;
create trigger reservations_quote after update of status, deleted_at on public.reservations for each row
  when (new.status = 'cancelled' or new.deleted_at is not null)
  execute function private.quote_follows_booking();

-- Hourly: quotes past their date that nobody accepted expire and free the dates.
create function private.expire_quotes() returns void
language plpgsql security definer set search_path = '' as $$
declare ids uuid[];
begin
  with x as (
    update public.quotes set status = 'expired' where status = 'sent' and valid_until < now() returning reservation_id
  ) select array_agg(reservation_id) into ids from x;
  if ids is not null then
    update public.reservations set status = 'cancelled' where id = any (ids) and status = 'option';
  end if;
end;
$$;
revoke execute on function private.expire_quotes() from public, anon, authenticated;
select cron.schedule('expire-quotes', '17 * * * *', 'select private.expire_quotes()');

-- Emails (when automatic emails are on): the quote to the guest when it's created, payment instructions when they
-- accept, and a note to the family when they answer.
alter table public.emails drop constraint emails_kind_check;
alter table public.emails add constraint emails_kind_check
  check (kind in ('template', 'request_ack', 'notify_request', 'notify_airbnb', 'notify_conflict', 'test', 'quote', 'quote_accepted', 'notify_quote'));
alter table public.emails add column quote_id uuid references public.quotes (id);
create index emails_quote_id_idx on public.emails (quote_id);

create function private.email_on_quote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s public.email_settings;
  addr text;
begin
  select * into s from public.email_settings;
  if not s.enabled then return new; end if;
  select trim(g.email) into addr from public.reservations r join public.guests g on g.id = r.guest_id where r.id = new.reservation_id;
  if tg_op = 'INSERT' then
    if coalesce(addr, '') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      insert into public.emails (kind, to_address, language, reservation_id, quote_id, dedupe_key)
      values ('quote', addr, new.language, new.reservation_id, new.id, 'quote:' || new.id) on conflict do nothing;
    end if;
  elsif new.status in ('accepted', 'declined') and old.status = 'sent' then
    if new.status = 'accepted' and coalesce(addr, '') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      insert into public.emails (kind, to_address, language, reservation_id, quote_id, dedupe_key)
      values ('quote_accepted', addr, new.language, new.reservation_id, new.id, 'quote_accepted:' || new.id) on conflict do nothing;
    end if;
    if private.notify_address() is not null then
      insert into public.emails (kind, to_address, language, reservation_id, quote_id, dedupe_key)
      values ('notify_quote', private.notify_address(), s.notify_language, new.reservation_id, new.id, 'notify_quote:' || new.id) on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
create trigger quotes_email after insert or update of status on public.quotes for each row execute function private.email_on_quote();
