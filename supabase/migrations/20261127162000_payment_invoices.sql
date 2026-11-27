-- Card payments → invoices. When Stripe confirms a payment, a *draft* invoice is prepared for the family to
-- check and issue (issuing stays a human step: the number is final and the invoice locks).
-- Two ways, chosen in the company details (ask the gestor which they prefer):
--   separate (default): each payment gets its own invoice. A deposit is invoiced as an advance payment when
--                       received (VAT is due then); the balance or full payment gets the rest of the stay.
--   single:             one invoice for the whole stay at the first payment; later payments add nothing.
-- The guest's company details from online check-in are used when given.

alter table public.company_settings
  add column payment_invoices text not null default 'separate' check (payment_invoices in ('separate', 'single'));

alter table public.invoices add column payment_id uuid references public.payments (id);
create unique index invoices_payment_id_idx on public.invoices (payment_id) where payment_id is not null and deleted_at is null;

-- Called by the stripe-webhook function (service role) once a payment is paid. Safe to call twice.
create function public.draft_invoice_for_payment(p_payment_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  r public.reservations;
  villa text;
  g public.guests;
  c public.checkins;
  co public.company_settings;
  so_far numeric;
  amount numeric;
  nights integer;
  stay text;
  descr text;
  inv uuid;
begin
  select * into p from public.payments where id = p_payment_id and status in ('paid', 'partially_refunded');
  if p.id is null then return null; end if;
  if exists (select 1 from public.invoices where payment_id = p.id and deleted_at is null) then return null; end if;
  select * into r from public.reservations where id = p.reservation_id;
  select pr.name into villa from public.units u join public.properties pr on pr.id = u.property_id where u.id = r.unit_id;
  select * into g from public.guests where id = r.guest_id;
  select * into c from public.checkins where reservation_id = r.id;
  select * into co from public.company_settings;
  nights := r.check_out - r.check_in;
  stay := format('Estancia en %s, del %s al %s (%s noches)', villa, to_char(r.check_in, 'DD/MM/YYYY'), to_char(r.check_out, 'DD/MM/YYYY'), nights);

  -- What's already invoiced for this stay (drafts included, corrective invoices aside), VAT included.
  select coalesce(sum(round(l.quantity * l.unit_price * (1 + l.vat_rate / 100), 2)), 0) into so_far
  from public.invoices i join public.invoice_lines l on l.invoice_id = i.id
  where i.reservation_id = r.id and i.deleted_at is null and i.kind <> 'corrective';

  if co.payment_invoices = 'single' then
    if so_far > 0 then return null; end if;
    amount := coalesce(r.total_amount, p.amount);
    descr := stay;
  elsif p.kind in ('balance', 'full') then
    amount := coalesce(r.total_amount, so_far + p.amount) - so_far;
    descr := case when so_far > 0 then stay || ' · resto, descontados los anticipos ya facturados' else stay end;
  else
    amount := p.amount;
    descr := case p.kind when 'extra' then 'Extra · ' || stay when 'deposit' then 'Anticipo · ' || stay else 'Pago a cuenta · ' || stay end;
  end if;
  if amount <= 0 then return null; end if;

  insert into public.invoices (reservation_id, payment_id, kind, customer_name, customer_tax_id, customer_address, customer_email, operation_date, notes)
  values (
    r.id, p.id,
    case when coalesce(c.invoice_tax_id, '') <> '' or amount > 400 then 'invoice' else 'simplified' end::public.invoice_kind,
    coalesce(nullif(c.invoice_name, ''), trim(concat_ws(' ', g.first_name, g.last_name))),
    coalesce(c.invoice_tax_id, ''),
    coalesce(c.invoice_address, ''),
    coalesce(g.email, ''),
    -- An advance is accrued when received; a stay when it starts.
    case when descr like 'Anticipo%' or descr like 'Pago a cuenta%' then (p.paid_at at time zone 'Europe/Madrid')::date else r.check_in end,
    format('Pagado con tarjeta el %s (%s €).', to_char(p.paid_at at time zone 'Europe/Madrid', 'DD/MM/YYYY'), replace(to_char(p.amount, 'FM999999990.00'), '.', ','))
  )
  returning id into inv;
  insert into public.invoice_lines (invoice_id, description, quantity, unit_price, vat_rate, sort)
  values (inv, descr, 1, round(amount / (1 + co.default_vat_rate / 100), 4), co.default_vat_rate, 0);
  return inv;
end;
$$;
revoke execute on function public.draft_invoice_for_payment(uuid) from public, anon, authenticated;
grant execute on function public.draft_invoice_for_payment(uuid) to service_role;
