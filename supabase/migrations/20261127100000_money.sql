-- Wave 2: money. Income and expenses per villa (or shared), for the monthly and yearly results and the
-- gestor's export. Airbnb payouts come in from Airbnb's earnings CSV; external_ref stops a row being
-- imported twice. Owners and managers only.

create type public.money_kind as enum ('income', 'expense');

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  kind public.money_kind not null,
  -- Null: shared by both villas (insurance, the accountant…).
  property_id uuid references public.properties (id),
  reservation_id uuid references public.reservations (id),
  day date not null,
  category text not null,
  description text not null default '',
  -- What was paid or received, VAT included.
  amount numeric(10, 2) not null check (amount > 0),
  vat_rate numeric(4, 2) check (vat_rate is null or vat_rate between 0 and 30),
  method text not null default '' check (method in ('', 'transfer', 'card', 'cash', 'airbnb', 'other')),
  counterparty text not null default '',
  external_ref text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint transactions_category_check check (
    (kind = 'income' and category in ('stay', 'airbnb', 'extra', 'other_income'))
    or (kind = 'expense' and category in ('cleaning', 'laundry', 'utilities', 'repairs', 'supplies', 'commissions', 'taxes', 'insurance', 'other'))
  )
);
create index transactions_day_idx on public.transactions (day);
create index transactions_property_id_idx on public.transactions (property_id);
create index transactions_reservation_id_idx on public.transactions (reservation_id);
create index transactions_created_by_idx on public.transactions (created_by);
create unique index transactions_external_ref_idx on public.transactions (external_ref) where external_ref is not null and deleted_at is null;

create trigger transactions_updated_at before update on public.transactions for each row execute function public.set_updated_at();

alter table public.transactions enable row level security;
create policy "managers manage money" on public.transactions for all to authenticated
  using ((select private.my_role()) in ('owner', 'manager')) with check ((select private.my_role()) in ('owner', 'manager'));
