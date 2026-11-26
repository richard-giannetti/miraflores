-- Wave 3: Airbnb calendar sync over iCal, both ways (docs/pms/features.md, module 2).
-- Import: the ical-sync Edge Function reads each unit's Airbnb calendar every hour and creates, moves or
-- cancels the matching bookings. Export: ical-export publishes each unit's own bookings and blocks at a secret
-- link, for Airbnb to import so those nights close on Airbnb too.

create extension if not exists pg_net;

-- The Airbnb calendar to import (Airbnb → Calendar → Availability → Export calendar), and the secret token
-- in the link Airbnb imports from us.
alter table public.units
  add column airbnb_ical_url text check (airbnb_ical_url is null or airbnb_ical_url ~ '^https://'),
  add column ical_token uuid not null default gen_random_uuid();
create unique index units_ical_token_idx on public.units (ical_token);

-- One Airbnb reservation, one booking here.
create unique index reservations_airbnb_ref_idx on public.reservations (external_ref)
  where source = 'airbnb' and external_ref is not null and deleted_at is null;

-- What each sync did, for the Settings screen ("last synced 5 min ago", "2 conflicts").
create table public.ical_sync_runs (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id),
  ran_at timestamptz not null default now(),
  ok boolean not null,
  created integer not null default 0,
  updated integer not null default 0,
  cancelled integer not null default 0,
  -- Airbnb bookings that overlap something already in the PMS: [{ref, check_in, check_out}]
  conflicts jsonb not null default '[]',
  error text
);
create index ical_sync_runs_unit_ran_idx on public.ical_sync_runs (unit_id, ran_at desc);

alter table public.ical_sync_runs enable row level security;
create policy "managers read sync runs" on public.ical_sync_runs for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));

-- The scheduler and the function share a secret kept in Vault; only the function (service role) checks it.
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'ical_sync_secret', 'Shared by pg_cron and the ical-sync Edge Function');

create function public.ical_sync_secret_ok(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'ical_sync_secret' and decrypted_secret = p_secret);
$$;
revoke execute on function public.ical_sync_secret_ok(text) from public, anon, authenticated;
grant execute on function public.ical_sync_secret_ok(text) to service_role;

-- Every 15 minutes (made hourly in the next migration). Keep only a month of run history.
select cron.schedule(
  'airbnb-ical-sync',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://lkbrydeqxnspsnpvimil.supabase.co/functions/v1/ical-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ical_sync_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  delete from public.ical_sync_runs where ran_at < now() - interval '30 days';
  $$
);
