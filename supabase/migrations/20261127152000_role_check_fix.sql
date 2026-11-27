-- Fix: "my_role() not in (...)" is null, not true, for a signed-in user without a profile, so these
-- functions let such a user through. They now use is_manager(), which is false unless the role is owner or
-- manager. Also: nobody signed out may accept booking requests, and pg_net moves out of the public schema.

create function private.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('owner', 'manager') from public.profiles where id = (select auth.uid())), false);
$$;
revoke execute on function private.is_manager() from public, anon;
grant execute on function private.is_manager() to authenticated;

create or replace function public.add_time_entry(p_staff uuid, p_property uuid, p_day date, p_in time, p_out time, p_reason text) returns public.time_entries
language plpgsql security definer set search_path = '' as $$
declare
  s record;
  e public.time_entries;
begin
  if not private.is_manager() then raise exception 'forbidden'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if p_out is null then raise exception 'end_required'; end if;
  select * into s from private.local_span(p_day, p_in, p_out);
  insert into public.time_entries (staff_id, property_id, clock_in, clock_out, source)
    values (p_staff, p_property, s.t_in, s.t_out, 'manual') returning * into e;
  insert into public.time_entry_changes (entry_id, action, new_clock_in, new_clock_out, reason)
    values (e.id, 'added', e.clock_in, e.clock_out, p_reason);
  return e;
end;
$$;

create or replace function public.correct_time_entry(p_id uuid, p_day date, p_in time, p_out time, p_reason text) returns public.time_entries
language plpgsql security definer set search_path = '' as $$
declare
  old public.time_entries;
  s record;
  e public.time_entries;
begin
  if not private.is_manager() then raise exception 'forbidden'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select * into old from public.time_entries where id = p_id and voided_at is null for update;
  if old.id is null then raise exception 'not_found'; end if;
  select * into s from private.local_span(p_day, p_in, p_out);
  update public.time_entries set clock_in = s.t_in, clock_out = s.t_out where id = p_id returning * into e;
  insert into public.time_entry_changes (entry_id, action, old_clock_in, old_clock_out, new_clock_in, new_clock_out, reason)
    values (p_id, 'corrected', old.clock_in, old.clock_out, e.clock_in, e.clock_out, p_reason);
  return e;
end;
$$;

create or replace function public.void_time_entry(p_id uuid, p_reason text) returns public.time_entries
language plpgsql security definer set search_path = '' as $$
declare
  e public.time_entries;
begin
  if not private.is_manager() then raise exception 'forbidden'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  update public.time_entries set voided_at = now() where id = p_id and voided_at is null returning * into e;
  if e.id is null then raise exception 'not_found'; end if;
  insert into public.time_entry_changes (entry_id, action, old_clock_in, old_clock_out, reason)
    values (p_id, 'voided', e.clock_in, e.clock_out, p_reason);
  return e;
end;
$$;

create or replace function public.accept_booking_request(p_id uuid, p_status public.reservation_status default 'option') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.booking_requests;
  unit uuid;
  guest uuid;
  res uuid;
  plan_kind text;
begin
  if not private.is_manager() then raise exception 'forbidden'; end if;
  select * into r from public.booking_requests where id = p_id and status = 'new' for update;
  if r.id is null then raise exception 'not_found'; end if;
  select o ->> 'kind' into plan_kind from jsonb_array_elements(r.quote -> 'options') o where o ->> 'plan' = r.plan;
  select id into unit from public.units where property_id = r.property_id and active and deleted_at is null order by sort limit 1;
  insert into public.guests (first_name, last_name, email, phone, language)
  values (split_part(r.name, ' ', 1), trim(substr(r.name, length(split_part(r.name, ' ', 1)) + 1)), r.email, nullif(r.phone, ''), r.language)
  returning id into guest;
  insert into public.reservations (unit_id, guest_id, kind, status, source, check_in, check_out, adults, children, total_amount, notes)
  values (unit, guest, 'booking', p_status, 'direct', r.check_in, r.check_out, r.adults, r.children, r.total,
          concat_ws(E'\n', 'Website request · ' || coalesce(plan_kind, r.plan) || coalesce(' · ' || r.promo_code, ''), nullif(r.message, '')))
  returning id into res;
  update public.booking_requests set status = 'accepted', reservation_id = res, handled_by = auth.uid(), handled_at = now() where id = r.id;
  if r.promo_code is not null then update public.promo_codes set used = used + 1 where code = r.promo_code and deleted_at is null; end if;
  return res;
exception when exclusion_violation then
  raise exception 'unavailable';
end;
$$;

revoke execute on function public.accept_booking_request(uuid, public.reservation_status) from anon;

-- pg_net can't change schema in place: recreate it in extensions (the cron job calls net.http_post, unchanged).
drop extension if exists pg_net;
create extension pg_net with schema extensions;
