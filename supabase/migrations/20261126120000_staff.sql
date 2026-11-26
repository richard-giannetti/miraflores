-- Wave 2: staff. The people who work at the villas (with or without a login), their department,
-- the weekly schedule, and the working-time register (registro de jornada, art. 34.9 Estatuto de los
-- Trabajadores): each person clocks in and out on their phone with the server's time, records are kept
-- at least 4 years, nobody can delete one, and every correction is logged with who, when and why.

create type public.department as enum ('management', 'reception', 'housekeeping', 'maintenance', 'kitchen', 'restaurant', 'pool', 'spa');
create type public.contract_kind as enum ('employee', 'freelancer', 'company');

-- Logins created by an owner start with a temporary password the person must replace.
alter table public.profiles add column must_change_password boolean not null default false;

create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  -- Their login, if they have one. The department decides which screens a staff login sees.
  user_id uuid unique references public.profiles (id) on delete set null,
  full_name text not null,
  department public.department not null default 'housekeeping',
  contract public.contract_kind not null default 'employee',
  phone text,
  email text,
  weekly_hours numeric(4, 1) check (weekly_hours is null or weekly_hours between 0 and 80),
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create type public.shift_kind as enum ('work', 'off', 'holiday', 'sick');

-- The planned schedule. Times are the villas' local time; an end before the start runs past midnight.
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_members (id),
  property_id uuid references public.properties (id),
  day date not null,
  kind public.shift_kind not null default 'work',
  starts time,
  ends time,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint shifts_times_check check (kind <> 'work' or (starts is not null and ends is not null and starts <> ends))
);
create index shifts_staff_day_idx on public.shifts (staff_id, day);
create index shifts_day_idx on public.shifts (day);
create index shifts_property_id_idx on public.shifts (property_id);

-- What actually happened. Written only through the functions below, never directly.
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_members (id),
  property_id uuid references public.properties (id),
  clock_in timestamptz not null,
  clock_out timestamptz,
  -- 'app': clocked by the person; 'manual': entered by a manager (with a reason in the log).
  source text not null default 'app' check (source in ('app', 'manual')),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  constraint time_entries_order_check check (clock_out is null or clock_out > clock_in)
);
create index time_entries_staff_in_idx on public.time_entries (staff_id, clock_in);
create index time_entries_property_id_idx on public.time_entries (property_id);
create index time_entries_created_by_idx on public.time_entries (created_by);
-- One open entry per person: you can't clock in twice.
create unique index time_entries_one_open_idx on public.time_entries (staff_id) where clock_out is null and voided_at is null;

create table public.time_entry_changes (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.time_entries (id),
  action text not null check (action in ('added', 'corrected', 'voided')),
  old_clock_in timestamptz,
  old_clock_out timestamptz,
  new_clock_in timestamptz,
  new_clock_out timestamptz,
  reason text not null check (length(trim(reason)) > 0),
  changed_by uuid references auth.users (id) default auth.uid(),
  changed_at timestamptz not null default now()
);
create index time_entry_changes_entry_id_idx on public.time_entry_changes (entry_id);
create index time_entry_changes_changed_by_idx on public.time_entry_changes (changed_by);

create trigger staff_members_updated_at before update on public.staff_members for each row execute function public.set_updated_at();
create trigger shifts_updated_at before update on public.shifts for each row execute function public.set_updated_at();
create trigger time_entries_updated_at before update on public.time_entries for each row execute function public.set_updated_at();

-- Access
alter table public.staff_members enable row level security;
alter table public.shifts enable row level security;
alter table public.time_entries enable row level security;
alter table public.time_entry_changes enable row level security;

-- Everyone on the team sees who works here and the schedule; managers keep them up to date.
create policy "team reads staff" on public.staff_members for select to authenticated using ((select private.my_role()) is not null);
create policy "managers manage staff" on public.staff_members for all to authenticated
  using ((select private.my_role()) in ('owner', 'manager')) with check ((select private.my_role()) in ('owner', 'manager'));
create policy "team reads shifts" on public.shifts for select to authenticated using ((select private.my_role()) is not null);
create policy "managers manage shifts" on public.shifts for all to authenticated
  using ((select private.my_role()) in ('owner', 'manager')) with check ((select private.my_role()) in ('owner', 'manager'));

-- The person whose hours they are reads them, and so do managers. No write policies: functions only.
create function private.my_staff_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.staff_members where user_id = (select auth.uid()) and deleted_at is null;
$$;
revoke execute on function private.my_staff_id() from public, anon;
grant execute on function private.my_staff_id() to authenticated;

create policy "own or managers read time" on public.time_entries for select to authenticated
  using ((select private.my_role()) in ('owner', 'manager') or staff_id = (select private.my_staff_id()));
create policy "own or managers read time changes" on public.time_entry_changes for select to authenticated
  using (
    (select private.my_role()) in ('owner', 'manager')
    or entry_id in (select id from public.time_entries where staff_id = (select private.my_staff_id()))
  );

-- Clocking, with the server's clock so a phone's wrong time can't change the record.
create function public.clock_in(p_property uuid default null) returns public.time_entries
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.my_staff_id();
  e public.time_entries;
begin
  if me is null then raise exception 'not_staff'; end if;
  if exists (select 1 from public.time_entries where staff_id = me and clock_out is null and voided_at is null) then
    raise exception 'already_clocked_in';
  end if;
  insert into public.time_entries (staff_id, property_id, clock_in) values (me, p_property, now()) returning * into e;
  return e;
end;
$$;

create function public.clock_out() returns public.time_entries
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.my_staff_id();
  e public.time_entries;
begin
  if me is null then raise exception 'not_staff'; end if;
  update public.time_entries set clock_out = now()
    where staff_id = me and clock_out is null and voided_at is null
    returning * into e;
  if e.id is null then raise exception 'not_clocked_in'; end if;
  return e;
end;
$$;

-- Managers add a forgotten day, fix a time or cancel a mistaken entry; the reason is required and kept.
-- Day and times are the villas' local time; an end before the start is the next day.
create function private.local_span(p_day date, p_in time, p_out time, out t_in timestamptz, out t_out timestamptz)
language sql immutable set search_path = '' as $$
  select (p_day + p_in) at time zone 'Europe/Madrid',
         case when p_out is null then null
              else (p_day + p_out + case when p_out <= p_in then interval '1 day' else interval '0' end) at time zone 'Europe/Madrid' end;
$$;

create function public.add_time_entry(p_staff uuid, p_property uuid, p_day date, p_in time, p_out time, p_reason text) returns public.time_entries
language plpgsql security definer set search_path = '' as $$
declare
  s record;
  e public.time_entries;
begin
  if private.my_role() not in ('owner', 'manager') then raise exception 'forbidden'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if p_out is null then raise exception 'end_required'; end if;
  select * into s from private.local_span(p_day, p_in, p_out);
  insert into public.time_entries (staff_id, property_id, clock_in, clock_out, source)
    values (p_staff, p_property, s.t_in, s.t_out, 'manual') returning * into e;
  insert into public.time_entry_changes (entry_id, action, new_clock_in, new_clock_out, reason)
    values (e.id, 'added', e.clock_in, e.clock_out, p_reason);
  return e;
end;
$$;

create function public.correct_time_entry(p_id uuid, p_day date, p_in time, p_out time, p_reason text) returns public.time_entries
language plpgsql security definer set search_path = '' as $$
declare
  old public.time_entries;
  s record;
  e public.time_entries;
begin
  if private.my_role() not in ('owner', 'manager') then raise exception 'forbidden'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select * into old from public.time_entries where id = p_id and voided_at is null for update;
  if old.id is null then raise exception 'not_found'; end if;
  select * into s from private.local_span(p_day, p_in, p_out);
  update public.time_entries set clock_in = s.t_in, clock_out = s.t_out where id = p_id returning * into e;
  insert into public.time_entry_changes (entry_id, action, old_clock_in, old_clock_out, new_clock_in, new_clock_out, reason)
    values (p_id, 'corrected', old.clock_in, old.clock_out, e.clock_in, e.clock_out, p_reason);
  return e;
end;
$$;

create function public.void_time_entry(p_id uuid, p_reason text) returns public.time_entries
language plpgsql security definer set search_path = '' as $$
declare
  e public.time_entries;
begin
  if private.my_role() not in ('owner', 'manager') then raise exception 'forbidden'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  update public.time_entries set voided_at = now() where id = p_id and voided_at is null returning * into e;
  if e.id is null then raise exception 'not_found'; end if;
  insert into public.time_entry_changes (entry_id, action, old_clock_in, old_clock_out, reason)
    values (p_id, 'voided', e.clock_in, e.clock_out, p_reason);
  return e;
end;
$$;

-- After replacing a temporary password, the person clears their own flag.
create function public.password_changed() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set must_change_password = false where id = (select auth.uid());
$$;

revoke execute on function private.local_span(date, time, time) from public, anon;
grant execute on function private.local_span(date, time, time) to authenticated;
revoke execute on function public.clock_in(uuid), public.clock_out(), public.add_time_entry(uuid, uuid, date, time, time, text),
  public.correct_time_entry(uuid, date, time, time, text), public.void_time_entry(uuid, text), public.password_changed() from public, anon;
grant execute on function public.clock_in(uuid), public.clock_out(), public.add_time_entry(uuid, uuid, date, time, time, text),
  public.correct_time_entry(uuid, date, time, time, text), public.void_time_entry(uuid, text), public.password_changed() to authenticated;

-- "Working now" on the managers' Today screen updates live.
alter publication supabase_realtime add table public.time_entries;
