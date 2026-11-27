-- Fix: "after booking" emails (the confirmation) only reached stays starting within 60 days, so a booking made
-- today for next summer got none. Stays further ahead now get them too (bookings made in the last 30 days).
create or replace function private.enqueue_due_emails() returns integer
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
      and r.check_out >= today - 16
      -- Messages tied to the stay start at most 60 days ahead; a confirmation goes out whenever the stay is.
      and (r.check_in <= today + 61 or (t.timing = 'after_booking' and r.created_at > now() - interval '30 days'))
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
