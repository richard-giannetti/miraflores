-- Settings for the admin (requested by the father, 2026-11-27): create properties and rooms, and the restaurant
-- menu for when the hotel opens.

-- A new property (a villa, or the hotel) gets its Rates row straight away, closed to direct booking.
create function private.property_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pricing (property_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke execute on function private.property_defaults() from public, anon, authenticated;
create trigger properties_defaults after insert on public.properties for each row execute function private.property_defaults();

-- The restaurant menu: categories (starters, mains, wines…) and items. Not sold yet: it's the catalogue the
-- future guest bill and restaurant screens will use. Names in es/en/fr; prices include VAT.
create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  -- null = every property; otherwise only that one's restaurant.
  property_id uuid references public.properties (id),
  name jsonb not null default '{}', -- {"es": "...", "en": "...", "fr": "..."}
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index menu_categories_property_id_idx on public.menu_categories (property_id);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.menu_categories (id),
  name jsonb not null default '{}',
  description jsonb not null default '{}',
  price numeric(10, 2) not null default 0 check (price >= 0),
  -- Spain: 10 % food and most drinks served, 21 % alcoholic drinks.
  vat_rate numeric(5, 2) not null default 10 check (vat_rate in (0, 4, 10, 21)),
  -- The 14 allergens EU law requires on menus (Regulation 1169/2011, annex II).
  allergens text[] not null default '{}' check (allergens <@ array[
    'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'nuts',
    'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'
  ]::text[]),
  available boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index menu_items_category_id_idx on public.menu_items (category_id);

create trigger menu_categories_updated_at before update on public.menu_categories for each row execute function public.set_updated_at();
create trigger menu_items_updated_at before update on public.menu_items for each row execute function public.set_updated_at();

alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
-- Everyone on the team reads the menu (kitchen and restaurant staff need it); owners and managers edit it.
create policy "team reads menu categories" on public.menu_categories for select to authenticated
  using ((select private.my_role()) is not null);
create policy "managers manage menu categories" on public.menu_categories for all to authenticated
  using ((select private.is_manager())) with check ((select private.is_manager()));
create policy "team reads menu items" on public.menu_items for select to authenticated
  using ((select private.my_role()) is not null);
create policy "managers manage menu items" on public.menu_items for all to authenticated
  using ((select private.is_manager())) with check ((select private.is_manager()));
revoke all on public.menu_categories, public.menu_items from anon;
