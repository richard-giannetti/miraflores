-- The quote page shows the bank transfer reference, the same as the payment email (MCT- + start of the booking id).
create or replace function public.quote_page(p_token text) returns jsonb
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
    'bank_details', case when q.status = 'accepted' then co.bank_details end,
    'reference', 'MCT-' || upper(left(r.id::text, 8))
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
