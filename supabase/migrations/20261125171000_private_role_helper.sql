-- Keep the role helper out of the public API (no /rest/v1/rpc/my_role); policies still use it.
-- The app reads the signed-in user's role from their own profiles row instead.
create schema if not exists private;
grant usage on schema private to authenticated;

create function private.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid());
$$;
revoke execute on function private.my_role() from public, anon;
grant execute on function private.my_role() to authenticated;

alter policy "read own profile, owners read all" on public.profiles
  using (id = (select auth.uid()) or (select private.my_role()) = 'owner');
alter policy "owners manage profiles" on public.profiles
  using ((select private.my_role()) = 'owner') with check ((select private.my_role()) = 'owner');
alter policy "team reads properties" on public.properties using ((select private.my_role()) is not null);
alter policy "owners manage properties" on public.properties
  using ((select private.my_role()) = 'owner') with check ((select private.my_role()) = 'owner');
alter policy "team reads units" on public.units using ((select private.my_role()) is not null);
alter policy "owners manage units" on public.units
  using ((select private.my_role()) = 'owner') with check ((select private.my_role()) = 'owner');
alter policy "managers manage guests" on public.guests
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager'));
alter policy "team reads reservations" on public.reservations using ((select private.my_role()) is not null);
alter policy "managers insert reservations" on public.reservations
  with check ((select private.my_role()) in ('owner', 'manager'));
alter policy "managers update reservations" on public.reservations
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager'));
alter policy "managers delete reservations" on public.reservations
  using ((select private.my_role()) in ('owner', 'manager'));

drop function public.my_role();
