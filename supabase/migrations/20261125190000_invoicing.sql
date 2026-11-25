-- Wave 2: invoicing. Invoices are drafted freely, then issued: issuing assigns the next number in its
-- series with no gaps, computes the totals and locks the invoice. Mistakes are fixed with a corrective
-- invoice, never by editing or deleting an issued one (RD 1619/2012).
-- VeriFactu signing by a certified service is added later; the verifactu_* columns are kept for it.

-- The company's own details, printed on every invoice. One row.
create table public.company_settings (
  id boolean primary key default true check (id),
  legal_name text not null default '',
  tax_id text not null default '',
  address text not null default '',
  postal_code text not null default '',
  city text not null default '',
  province text not null default '',
  country text not null default 'España',
  email text not null default '',
  phone text not null default '',
  default_vat_rate numeric(5, 2) not null default 10,
  invoice_footer text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.company_settings (legal_name, email) values ('Miraflores Costa Tropical SL', 'info@miraflorescostatropical.com');

create type public.invoice_kind as enum ('invoice', 'simplified', 'corrective');
create type public.invoice_status as enum ('draft', 'issued');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations (id),
  kind public.invoice_kind not null default 'invoice',
  status public.invoice_status not null default 'draft',
  -- Set when issued, e.g. series 'F2026', number 7 → 'F2026-0007'.
  series text,
  number integer,
  full_number text unique,
  issue_date date,
  operation_date date,
  -- Recipient
  customer_name text not null default '',
  customer_tax_id text not null default '',
  customer_address text not null default '',
  customer_country text not null default '',
  customer_email text not null default '',
  -- Corrective invoices point at what they correct.
  corrects_invoice_id uuid references public.invoices (id),
  correction_reason text not null default '',
  notes text not null default '',
  currency text not null default 'EUR',
  -- Computed when issued.
  total_base numeric(12, 2),
  total_vat numeric(12, 2),
  total numeric(12, 2),
  -- Company details as they were when issued (the settings may change later).
  issuer jsonb,
  verifactu_status text,
  verifactu_ref text,
  verifactu_qr text,
  issued_by uuid references auth.users (id),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (series, number)
);
create index invoices_reservation_id_idx on public.invoices (reservation_id);
create index invoices_corrects_invoice_id_idx on public.invoices (corrects_invoice_id);
create index invoices_issued_by_idx on public.invoices (issued_by);
create index invoices_created_by_idx on public.invoices (created_by);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 4) not null, -- before VAT
  vat_rate numeric(5, 2) not null default 10,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoice_lines_invoice_id_idx on public.invoice_lines (invoice_id);

-- Last number used per series. Only reachable through private.next_invoice_number().
create table public.invoice_counters (
  series text primary key,
  last_number integer not null
);

create function private.next_invoice_number(p_series text) returns integer
language sql security definer set search_path = '' as $$
  -- The counter row stays locked until the transaction ends, so two people can't get the same number.
  insert into public.invoice_counters (series, last_number) values (p_series, 1)
  on conflict (series) do update set last_number = public.invoice_counters.last_number + 1
  returning last_number;
$$;
revoke execute on function private.next_invoice_number(text) from public, anon;
grant execute on function private.next_invoice_number(text) to authenticated;

create trigger company_settings_updated_at before update on public.company_settings for each row execute function public.set_updated_at();
create trigger invoices_updated_at before update on public.invoices for each row execute function public.set_updated_at();
create trigger invoice_lines_updated_at before update on public.invoice_lines for each row execute function public.set_updated_at();

-- Issued invoices can't be changed or deleted, except to record the VeriFactu result.
create function private.lock_issued_invoice() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'issued' then raise exception 'Issued invoices cannot be deleted; issue a corrective invoice' using errcode = 'P0001'; end if;
    return old;
  end if;
  if old.status = 'issued' and (
    (to_jsonb(new) - array['verifactu_status', 'verifactu_ref', 'verifactu_qr', 'updated_at'])
    is distinct from (to_jsonb(old) - array['verifactu_status', 'verifactu_ref', 'verifactu_qr', 'updated_at'])
  ) then
    raise exception 'Issued invoices cannot be changed; issue a corrective invoice' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger invoices_lock before update or delete on public.invoices for each row execute function private.lock_issued_invoice();

create function private.lock_issued_lines() returns trigger
language plpgsql set search_path = '' as $$
declare
  inv uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  if exists (select 1 from public.invoices where id = inv and status = 'issued')
     or (tg_op = 'UPDATE' and exists (select 1 from public.invoices where id = old.invoice_id and status = 'issued')) then
    raise exception 'Lines of an issued invoice cannot be changed' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger invoice_lines_lock before insert or update or delete on public.invoice_lines for each row execute function private.lock_issued_lines();

-- Issue a draft: check it, number it, total it, freeze the issuer's details, lock it.
create function public.issue_invoice(p_id uuid) returns public.invoices
language plpgsql security invoker set search_path = '' as $$
declare
  inv public.invoices;
  co public.company_settings;
  prefix text;
  ser text;
  today date := (now() at time zone 'Europe/Madrid')::date;
  num integer;
  b numeric(12, 2);
  v numeric(12, 2);
begin
  select * into inv from public.invoices where id = p_id and deleted_at is null for update;
  if inv.id is null then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if inv.status <> 'draft' then raise exception 'Invoice is already issued' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.invoice_lines where invoice_id = p_id) then
    raise exception 'An invoice needs at least one line' using errcode = 'P0001';
  end if;

  select * into co from public.company_settings;
  if co.legal_name = '' or co.tax_id = '' or co.address = '' then
    raise exception 'Fill in the company''s name, tax ID and address first' using errcode = 'P0001';
  end if;
  if inv.kind in ('invoice', 'corrective') and (inv.customer_name = '' or inv.customer_address = '') then
    raise exception 'A full invoice needs the customer''s name and address' using errcode = 'P0001';
  end if;
  if inv.kind = 'corrective' and inv.corrects_invoice_id is null then
    raise exception 'A corrective invoice must reference the invoice it corrects' using errcode = 'P0001';
  end if;

  -- Each line's base and VAT rounded to the cent, then summed.
  select coalesce(sum(round(quantity * unit_price, 2)), 0),
         coalesce(sum(round(round(quantity * unit_price, 2) * vat_rate / 100, 2)), 0)
  into b, v
  from public.invoice_lines where invoice_id = p_id;

  if inv.kind = 'simplified' and b + v > 400 then
    raise exception 'Simplified invoices are limited to 400 € (VAT included); issue a full invoice' using errcode = 'P0001';
  end if;

  prefix := case inv.kind when 'invoice' then 'F' when 'simplified' then 'S' else 'R' end;
  -- Numbers must follow the issue dates, so an invoice is always dated the day it's issued.
  ser := prefix || to_char(today, 'YYYY');
  num := private.next_invoice_number(ser);

  update public.invoices set
    status = 'issued',
    series = ser,
    number = num,
    full_number = ser || '-' || lpad(num::text, 4, '0'),
    issue_date = today,
    total_base = b,
    total_vat = v,
    total = b + v,
    issuer = to_jsonb(co) - array['id', 'updated_at', 'default_vat_rate'],
    issued_by = (select auth.uid())
  where id = p_id
  returning * into inv;
  return inv;
end;
$$;
revoke execute on function public.issue_invoice(uuid) from public, anon;
grant execute on function public.issue_invoice(uuid) to authenticated;

-- Start a corrective invoice: same customer, the original lines negated, ready to edit and issue.
create function public.start_correction(p_id uuid, p_reason text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  orig public.invoices;
  new_id uuid;
begin
  select * into orig from public.invoices where id = p_id;
  if orig.status <> 'issued' then raise exception 'Only issued invoices can be corrected' using errcode = 'P0001'; end if;
  insert into public.invoices (reservation_id, kind, operation_date, customer_name, customer_tax_id, customer_address,
    customer_country, customer_email, corrects_invoice_id, correction_reason)
  values (orig.reservation_id, 'corrective', orig.operation_date, orig.customer_name, orig.customer_tax_id, orig.customer_address,
    orig.customer_country, orig.customer_email, orig.id, coalesce(p_reason, ''))
  returning id into new_id;
  insert into public.invoice_lines (invoice_id, description, quantity, unit_price, vat_rate, sort)
  select new_id, description, -quantity, unit_price, vat_rate, sort from public.invoice_lines where invoice_id = p_id;
  return new_id;
end;
$$;
revoke execute on function public.start_correction(uuid, text) from public, anon;
grant execute on function public.start_correction(uuid, text) to authenticated;

alter table public.company_settings enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_counters enable row level security;

create policy "managers read company" on public.company_settings for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy "owners update company" on public.company_settings for update to authenticated
  using ((select private.my_role()) = 'owner') with check ((select private.my_role()) = 'owner');

create policy "managers read invoices" on public.invoices for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager'));
create policy "managers insert invoices" on public.invoices for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy "managers update invoices" on public.invoices for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy "managers delete draft invoices" on public.invoices for delete to authenticated
  using ((select private.my_role()) in ('owner', 'manager') and status = 'draft');

create policy "managers manage invoice lines" on public.invoice_lines for all to authenticated
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager'));
