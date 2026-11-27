-- The booking note names the rate type (non_refundable…), not its internal id.
create or replace function public.accept_booking_request(p_id uuid, p_status public.reservation_status default 'option') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.booking_requests;
  unit uuid;
  guest uuid;
  res uuid;
  plan_kind text;
begin
  if private.my_role() not in ('owner', 'manager') then raise exception 'forbidden'; end if;
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
