-- Automatic emails through Resend (the RESEND_API_KEY secret). Everything goes through one queue, public.emails,
-- which is also the log the family sees: rows are added by the database (triggers and a 5-minute schedule) and
-- sent by the email-send Edge Function. A dedupe key makes sure nothing goes twice.
--   - Guest templates switched to "send by email" go out on their day, between 9:00 and 21:00 (Madrid).
--   - A website request gets an acknowledgement; the family gets an email for each new request, each new Airbnb
--     booking and each Airbnb conflict.
-- Nothing is queued while the master switch (email_settings.enabled) is off.

create table public.email_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  enabled_since timestamptz,
  from_name text not null default 'Miraflores Costa Tropical',
  from_address text not null default 'reservas@miraflorescostatropical.com',
  -- Where guests' replies go; empty = the company email.
  reply_to text not null default '',
  -- The family's notifications; empty address = the company email.
  notify_to text not null default '',
  notify_language text not null default 'es' check (notify_language in ('es', 'en', 'fr')),
  request_ack boolean not null default true,
  notify_requests boolean not null default true,
  notify_airbnb boolean not null default true,
  notify_conflicts boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.email_settings default values;
create trigger email_settings_updated_at before update on public.email_settings for each row execute function public.set_updated_at();

alter table public.message_templates
  add column auto_email boolean not null default false,
  add column auto_email_since timestamptz;

-- When a switch is turned on, remember when: "after booking" emails only go to bookings made after that,
-- not to everyone already booked.
create function private.stamp_email_switches() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'email_settings' then
    if new.enabled and (tg_op = 'INSERT' or not old.enabled) then new.enabled_since := now(); end if;
  elsif new.auto_email and (tg_op = 'INSERT' or not old.auto_email) then
    new.auto_email_since := now();
  end if;
  return new;
end;
$$;
create trigger email_settings_stamp before insert or update on public.email_settings for each row execute function private.stamp_email_switches();
create trigger message_templates_stamp before insert or update on public.message_templates for each row execute function private.stamp_email_switches();

create table public.emails (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('template', 'request_ack', 'notify_request', 'notify_airbnb', 'notify_conflict', 'test')),
  to_address text not null,
  language text not null default 'en' check (language in ('es', 'en', 'fr')),
  reservation_id uuid references public.reservations (id),
  template_id uuid references public.message_templates (id),
  request_id uuid references public.booking_requests (id),
  unit_id uuid references public.units (id),
  -- Extra details for the text (an Airbnb conflict's dates…).
  data jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  subject text not null default '',
  attempts integer not null default 0,
  error text,
  provider_id text,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index emails_status_idx on public.emails (status, created_at) where status in ('queued', 'sending', 'failed');
create index emails_reservation_id_idx on public.emails (reservation_id);
create index emails_template_id_idx on public.emails (template_id);
create index emails_request_id_idx on public.emails (request_id);
create index emails_unit_id_idx on public.emails (unit_id);
create index emails_created_at_idx on public.emails (created_at desc);

alter table public.email_settings enable row level security;
alter table public.emails enable row level security;
create policy "managers read email settings" on public.email_settings for select to authenticated using ((select private.is_manager()));
create policy "managers update email settings" on public.email_settings for update to authenticated
  using ((select private.is_manager())) with check ((select private.is_manager()));
create policy "managers read emails" on public.emails for select to authenticated using ((select private.is_manager()));
revoke all on public.email_settings, public.emails from anon;

-- es/en/fr from whatever the guest record says (same rule as the PMS); English otherwise.
create function private.mail_lang(l text) returns text
language sql immutable set search_path = '' as $$
  select case when lower(coalesce(l, '')) ~ '^(es|spa|espa)' then 'es' when lower(coalesce(l, '')) ~ '^(fr|fra|fre)' then 'fr' else 'en' end;
$$;

-- The family's address for notifications.
create function private.notify_address() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(trim(s.notify_to), ''), nullif(trim(c.email), ''))
  from public.email_settings s cross join public.company_settings c;
$$;

-- A new website request: thank the guest, tell the family.
create function private.email_on_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.email_settings;
begin
  select * into s from public.email_settings;
  if not s.enabled then return new; end if;
  if s.request_ack then
    insert into public.emails (kind, to_address, language, request_id, dedupe_key)
    values ('request_ack', new.email, new.language, new.id, 'request_ack:' || new.id) on conflict do nothing;
  end if;
  if s.notify_requests and private.notify_address() is not null then
    insert into public.emails (kind, to_address, language, request_id, dedupe_key)
    values ('notify_request', private.notify_address(), s.notify_language, new.id, 'notify_request:' || new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger booking_requests_email after insert on public.booking_requests for each row execute function private.email_on_request();

-- A new booking brought in by the Airbnb sync.
create function private.email_on_airbnb_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.email_settings;
begin
  select * into s from public.email_settings;
  if s.enabled and s.notify_airbnb and private.notify_address() is not null then
    insert into public.emails (kind, to_address, language, reservation_id, unit_id, dedupe_key)
    values ('notify_airbnb', private.notify_address(), s.notify_language, new.id, new.unit_id, 'notify_airbnb:' || new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger reservations_email_airbnb after insert on public.reservations for each row
  when (new.source = 'airbnb' and new.external_ref is not null and new.kind = 'booking')
  execute function private.email_on_airbnb_booking();

-- An Airbnb booking that clashes with one here: one email per distinct set of conflicts, not every hour.
create function private.email_on_sync_conflict() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.email_settings;
begin
  select * into s from public.email_settings;
  if s.enabled and s.notify_conflicts and private.notify_address() is not null then
    insert into public.emails (kind, to_address, language, unit_id, data, dedupe_key)
    values ('notify_conflict', private.notify_address(), s.notify_language, new.unit_id, jsonb_build_object('conflicts', new.conflicts),
            'notify_conflict:' || new.unit_id || ':' || md5(new.conflicts::text))
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger ical_sync_runs_email after insert on public.ical_sync_runs for each row
  when (jsonb_array_length(new.conflicts) > 0)
  execute function private.email_on_sync_conflict();

-- Guest templates switched to email whose day has come (same rules as "Messages to send" on Today), queued
-- between 9:00 and 21:00 Madrid time. A message already sent by hand is never sent again.
create function private.enqueue_due_emails() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  s public.email_settings;
  today date := (now() at time zone 'Europe/Madrid')::date;
  hour integer := extract(hour from now() at time zone 'Europe/Madrid');
  n integer;
begin
  select * into s from public.email_settings;
  if not s.enabled or hour < 9 or hour >= 21 then return 0; end if;
  insert into public.emails (kind, to_address, language, reservation_id, template_id, dedupe_key)
  select 'template', trim(g.email), private.mail_lang(g.language), r.id, t.id, 'template:' || t.id || ':' || r.id
  from public.message_templates t
  cross join lateral (
    select r.*, case t.timing
      when 'after_booking' then (r.created_at at time zone 'Europe/Madrid')::date + t.offset_days
      when 'before_arrival' then r.check_in - t.offset_days
      when 'on_arrival' then r.check_in
      when 'before_departure' then r.check_out - t.offset_days
      when 'after_departure' then r.check_out + t.offset_days
    end as due
    from public.reservations r
    where r.deleted_at is null and r.kind = 'booking' and r.status <> 'cancelled'
      and r.check_out >= today - 16 and r.check_in <= today + 61
  ) r
  join public.guests g on g.id = r.guest_id
  where t.deleted_at is null and t.active and t.auto_email and t.timing <> 'manual'
    and coalesce(trim(g.email), '') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and (r.source <> 'airbnb' or t.include_airbnb)
    and r.due <= today
    and case t.timing
      when 'after_departure' then today - r.due <= 14
      when 'before_departure' then today <= r.check_out
      else today <= r.check_in
    end
    and (t.timing <> 'after_booking' or r.created_at >= greatest(t.auto_email_since, s.enabled_since))
    and not exists (select 1 from public.messages_sent m where m.reservation_id = r.id and m.template_id = t.id)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- For the email-send function: take a batch of queued emails (skip what another run is already sending).
create function public.claim_emails(p_limit integer default 25) returns setof public.emails
language sql security definer set search_path = '' as $$
  update public.emails e set status = 'sending', attempts = e.attempts + 1
  where e.id in (
    select id from public.emails
    where status = 'queued' or (status = 'failed' and attempts < 5 and created_at > now() - interval '2 days')
    order by created_at
    limit p_limit
    for update skip locked
  )
  returning e.*;
$$;
revoke execute on function public.claim_emails(integer) from public, anon, authenticated;
grant execute on function public.claim_emails(integer) to service_role;

-- The scheduler and the function share a secret kept in Vault (as for the Airbnb sync).
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'email_send_secret', 'Shared by pg_cron and the email-send Edge Function');
create function public.email_secret_ok(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'email_send_secret' and decrypted_secret = p_secret);
$$;
revoke execute on function public.email_secret_ok(text) from public, anon, authenticated;
grant execute on function public.email_secret_ok(text) to service_role;

-- Wake the sender: right after something is queued, and every 5 minutes for due templates and retries.
create function private.kick_email_sender() returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- A send interrupted halfway goes back in the queue.
  update public.emails set status = 'queued' where status = 'sending' and created_at < now() - interval '15 minutes' and attempts < 5;
  if exists (select 1 from public.emails where status = 'queued' or (status = 'failed' and attempts < 5 and created_at > now() - interval '2 days')) then
    perform net.http_post(
      url := 'https://lkbrydeqxnspsnpvimil.supabase.co/functions/v1/email-send',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-email-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_send_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  end if;
end;
$$;

create function private.emails_queued() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.kick_email_sender();
  return null;
end;
$$;
create trigger emails_kick after insert on public.emails for each statement execute function private.emails_queued();

select cron.schedule('email-send', '*/5 * * * *', $$
  select private.enqueue_due_emails();
  select private.kick_email_sender();
  delete from public.emails where created_at < now() - interval '400 days';
$$);
