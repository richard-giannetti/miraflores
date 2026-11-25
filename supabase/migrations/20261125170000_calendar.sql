-- Wave 1: the calendar. Properties and their bookable units, guests, reservations and blocks.
-- Offline-ready from day one (docs/adr/0002-pms-backend.md): UUIDs that a device can create,
-- updated_at on every table, soft deletes with deleted_at.

create extension if not exists btree_gist with schema extensions;

-- Who can use the PMS. A row is created by hand (or invite) for each family member or staff member.
create type public.app_role as enum ('owner', 'manager', 'staff');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'staff',
  language text not null default 'es' check (language in ('es', 'en', 'fr')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.property_kind as enum ('villa', 'hotel');

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  kind public.property_kind not null default 'villa',
  locality text not null default '',
  timezone text not null default 'Europe/Madrid',
  check_in_time time not null default '16:00',
  check_out_time time not null default '11:00',
  color text not null default '#6b7a3a',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- A bookable unit: a whole villa today, a hotel room later. The calendar has one row per unit.
create type public.unit_kind as enum ('whole_property', 'room');

create table public.units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id),
  name text not null,
  kind public.unit_kind not null default 'whole_property',
  capacity integer not null check (capacity > 0),
  bedrooms integer,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index units_property_id_idx on public.units (property_id);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null default '',
  last_name text not null default '',
  email text,
  phone text,
  language text,
  nationality text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create type public.reservation_kind as enum ('booking', 'block');
create type public.reservation_status as enum ('option', 'confirmed', 'checked_in', 'checked_out', 'cancelled');
create type public.reservation_source as enum ('direct', 'airbnb', 'booking', 'phone', 'email', 'other');

-- Bookings and blocks (owner stays, maintenance) share one table so one rule stops any overlap.
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id),
  guest_id uuid references public.guests (id),
  kind public.reservation_kind not null default 'booking',
  status public.reservation_status not null default 'confirmed',
  source public.reservation_source not null default 'direct',
  check_in date not null,
  check_out date not null,
  -- Nights occupied: check-in day included, check-out day free for the next arrival.
  stay daterange generated always as (daterange(check_in, check_out, '[)')) stored,
  adults integer not null default 1 check (adults >= 0),
  children integer not null default 0 check (children >= 0),
  total_amount numeric(10, 2),
  currency text not null default 'EUR',
  external_ref text,
  title text not null default '',
  notes text not null default '',
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint reservations_dates_check check (check_out > check_in),
  -- No double bookings: two live reservations can't share a night on the same unit.
  constraint reservations_no_overlap exclude using gist (unit_id with =, stay with &&)
    where (status <> 'cancelled' and deleted_at is null)
);
create index reservations_unit_id_idx on public.reservations (unit_id);
create index reservations_guest_id_idx on public.reservations (guest_id);
create index reservations_created_by_idx on public.reservations (created_by);
create index reservations_stay_idx on public.reservations using gist (stay);

-- updated_at maintenance
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger properties_updated_at before update on public.properties for each row execute function public.set_updated_at();
create trigger units_updated_at before update on public.units for each row execute function public.set_updated_at();
create trigger guests_updated_at before update on public.guests for each row execute function public.set_updated_at();
create trigger reservations_updated_at before update on public.reservations for each row execute function public.set_updated_at();

-- Access rules. Owners and managers run the calendar; staff can look at it.
create function public.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid());
$$;
revoke execute on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.units enable row level security;
alter table public.guests enable row level security;
alter table public.reservations enable row level security;

create policy "read own profile, owners read all" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.my_role()) = 'owner');
create policy "owners manage profiles" on public.profiles for all to authenticated
  using ((select public.my_role()) = 'owner') with check ((select public.my_role()) = 'owner');

create policy "team reads properties" on public.properties for select to authenticated
  using ((select public.my_role()) is not null);
create policy "owners manage properties" on public.properties for all to authenticated
  using ((select public.my_role()) = 'owner') with check ((select public.my_role()) = 'owner');

create policy "team reads units" on public.units for select to authenticated
  using ((select public.my_role()) is not null);
create policy "owners manage units" on public.units for all to authenticated
  using ((select public.my_role()) = 'owner') with check ((select public.my_role()) = 'owner');

create policy "managers manage guests" on public.guests for all to authenticated
  using ((select public.my_role()) in ('owner', 'manager'))
  with check ((select public.my_role()) in ('owner', 'manager'));

create policy "team reads reservations" on public.reservations for select to authenticated
  using ((select public.my_role()) is not null);
create policy "managers insert reservations" on public.reservations for insert to authenticated
  with check ((select public.my_role()) in ('owner', 'manager'));
create policy "managers update reservations" on public.reservations for update to authenticated
  using ((select public.my_role()) in ('owner', 'manager'))
  with check ((select public.my_role()) in ('owner', 'manager'));
create policy "managers delete reservations" on public.reservations for delete to authenticated
  using ((select public.my_role()) in ('owner', 'manager'));

-- Live calendar updates between devices.
alter publication supabase_realtime add table public.reservations;

-- The two villas.
insert into public.properties (name, slug, kind, locality, color, sort) values
  ('Villa Los Olivos', 'villa-los-olivos', 'villa', 'Motril', '#6b7a3a', 1),
  ('Villa La Playa', 'villa-la-playa-calahonda', 'villa', 'Calahonda', '#2f6f8f', 2);

insert into public.units (property_id, name, kind, capacity, bedrooms, sort)
select id, name, 'whole_property',
  case slug when 'villa-los-olivos' then 15 else 8 end,
  case slug when 'villa-los-olivos' then 7 else 4 end,
  sort
from public.properties;
