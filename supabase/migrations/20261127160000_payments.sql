-- Wave 3: card payments with Stripe (docs/pms/features.md, modules 8 and 10).
-- The family creates a payment (deposit, balance, any amount) on a booking; the guest gets a lasting link
-- (pms…/pay/<token>) that opens Stripe Checkout. Stripe's webhook marks it paid, confirms an option booking and
-- records the income in Money. Refunds start from the booking. Stripe keys live only in Edge Function secrets.

alter table public.pricing
  add column deposit_pct numeric(5, 2) not null default 30 check (deposit_pct between 0 and 100),
  add column balance_days_before integer not null default 30 check (balance_days_before between 0 and 180);

create type public.payment_status as enum ('pending', 'paid', 'cancelled', 'refunded', 'partially_refunded');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id),
  -- The secret part of the guest's link.
  token uuid not null default gen_random_uuid(),
  kind text not null default 'deposit' check (kind in ('deposit', 'balance', 'full', 'extra', 'other')),
  description text not null default '',
  amount numeric(10, 2) not null check (amount >= 0.5),
  currency text not null default 'EUR',
  status public.payment_status not null default 'pending',
  stripe_session_id text,
  stripe_payment_intent text,
  paid_at timestamptz,
  refunded_amount numeric(10, 2) not null default 0,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index payments_token_idx on public.payments (token);
create index payments_reservation_id_idx on public.payments (reservation_id);
create index payments_created_by_idx on public.payments (created_by);
create index payments_intent_idx on public.payments (stripe_payment_intent);

create trigger payments_updated_at before update on public.payments for each row execute function public.set_updated_at();

alter table public.payments enable row level security;
create policy "managers read payments" on public.payments for select to authenticated using ((select private.is_manager()));
create policy "managers create payments" on public.payments for insert to authenticated
  with check ((select private.is_manager()) and status = 'pending');
-- Only a pending link can be cancelled by hand; paid and refunded come from Stripe.
create policy "managers cancel pending payments" on public.payments for update to authenticated
  using ((select private.is_manager()) and status = 'pending') with check ((select private.is_manager()) and status in ('pending', 'cancelled'));
alter publication supabase_realtime add table public.payments;

-- What the guest's payment page shows: villa, dates, what it's for, the amount and whether it's paid.
create function public.payment_page(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'status', p.status,
    'kind', p.kind,
    'description', p.description,
    'amount', p.amount,
    'currency', p.currency,
    'paid_at', p.paid_at,
    'villa', pr.name,
    'check_in', r.check_in,
    'check_out', r.check_out,
    'guest', g.first_name,
    'language', coalesce(nullif(lower(left(g.language, 2)), ''), 'en')
  )
  from public.payments p
  join public.reservations r on r.id = p.reservation_id
  join public.units u on u.id = r.unit_id
  join public.properties pr on pr.id = u.property_id
  left join public.guests g on g.id = r.guest_id
  where p.token = p_token;
$$;
revoke execute on function public.payment_page(uuid) from public;
grant execute on function public.payment_page(uuid) to anon, authenticated;
