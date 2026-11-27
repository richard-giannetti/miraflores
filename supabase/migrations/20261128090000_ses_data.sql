-- Data SES.Hospedajes needs that online check-in didn't collect yet (see docs/pms/ses-hospedajes.md):
--   - the INE municipality code (5 digits) for travellers living in Spain;
--   - how the stay was paid, with SES's codes (EFECT cash, TARJT card, PLATF payment platform such as Airbnb,
--     TRANS bank transfer, MOVIL mobile payment, TREG gift card, DESTI paid at the property, OTRO other).
-- Minors' relationship becomes a fixed list (child, grandchild, sibling…), turned into SES's codes when sending.

alter table public.travellers
  add column residence_municipality_code text not null default '' check (residence_municipality_code ~ '^(\d{5})?$');

alter table public.reservations
  add column payment_method text check (payment_method in ('EFECT', 'TARJT', 'PLATF', 'TRANS', 'MOVIL', 'TREG', 'DESTI', 'OTRO'));

create or replace function public.checkin_submit(p_token text, p_data jsonb) returns jsonb
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
      residence_country, residence_municipality_code, phone, email, relationship)
    values (c.id, n, left(trim(t ->> 'first_name'), 100), left(trim(t ->> 'last_name_1'), 100), left(trim(coalesce(t ->> 'last_name_2', '')), 100),
      coalesce(t ->> 'sex', ''), (t ->> 'birth_date')::date, left(coalesce(t ->> 'nationality', ''), 3),
      coalesce(t ->> 'doc_type', ''), left(upper(trim(coalesce(t ->> 'doc_number', ''))), 40), left(upper(trim(coalesce(t ->> 'doc_support_number', ''))), 40),
      nullif(t ->> 'doc_issue_date', '')::date, left(coalesce(t ->> 'residence_address', ''), 200), left(coalesce(t ->> 'residence_city', ''), 100),
      left(coalesce(t ->> 'residence_postal_code', ''), 20), left(coalesce(t ->> 'residence_country', ''), 3),
      -- INE code, only for residents of Spain.
      case when t ->> 'residence_country' = 'ESP' and coalesce(t ->> 'residence_municipality_code', '') ~ '^\d{5}$' then t ->> 'residence_municipality_code' else '' end,
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
