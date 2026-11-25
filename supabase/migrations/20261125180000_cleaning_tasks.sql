-- Wave 1: cleaning tasks created automatically from departures, with a checklist per villa.

create type public.task_kind as enum ('cleaning', 'inspection', 'maintenance', 'other');
create type public.task_status as enum ('todo', 'in_progress', 'done', 'skipped');

-- The checklist for each villa (Spanish first: it's for the staff).
create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id),
  label text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index checklist_items_property_id_idx on public.checklist_items (property_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id),
  reservation_id uuid references public.reservations (id),
  kind public.task_kind not null default 'cleaning',
  title text not null default '',
  due_date date not null,
  status public.task_status not null default 'todo',
  assigned_to uuid references public.profiles (id),
  -- Ids of the checklist items ticked off.
  checked uuid[] not null default '{}',
  notes text not null default '',
  completed_at timestamptz,
  completed_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index tasks_unit_id_idx on public.tasks (unit_id);
create index tasks_due_date_idx on public.tasks (due_date);
create index tasks_assigned_to_idx on public.tasks (assigned_to);
create index tasks_completed_by_idx on public.tasks (completed_by);
-- One automatic cleaning per reservation.
create unique index tasks_one_cleaning_per_reservation on public.tasks (reservation_id) where kind = 'cleaning';

create trigger checklist_items_updated_at before update on public.checklist_items for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();

-- Keep each booking's departure cleaning in step with the booking:
-- created on save, moved with the departure date or villa, cancelled with the booking.
create function private.sync_cleaning_task() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  live boolean := new.kind = 'booking' and new.status <> 'cancelled' and new.deleted_at is null;
begin
  if live then
    insert into public.tasks (unit_id, reservation_id, kind, due_date)
    values (new.unit_id, new.id, 'cleaning', new.check_out)
    on conflict (reservation_id) where kind = 'cleaning'
    do update set
      unit_id = excluded.unit_id,
      due_date = excluded.due_date,
      deleted_at = null,
      status = case when public.tasks.status = 'skipped' then 'todo' else public.tasks.status end
    where public.tasks.status <> 'done';
  else
    update public.tasks set status = 'skipped'
    where reservation_id = new.id and kind = 'cleaning' and status in ('todo', 'in_progress');
  end if;
  return new;
end;
$$;
revoke execute on function private.sync_cleaning_task() from public, anon, authenticated;

create trigger reservations_cleaning after insert or update of unit_id, check_out, status, kind, deleted_at
  on public.reservations for each row execute function private.sync_cleaning_task();

-- Record who finished a task and when.
create function private.stamp_task_completion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at = now();
    new.completed_by = (select auth.uid());
  elsif new.status <> 'done' then
    new.completed_at = null;
    new.completed_by = null;
  end if;
  return new;
end;
$$;
create trigger tasks_completion before update on public.tasks for each row execute function private.stamp_task_completion();

alter table public.checklist_items enable row level security;
alter table public.tasks enable row level security;

create policy "team reads checklists" on public.checklist_items for select to authenticated
  using ((select private.my_role()) is not null);
create policy "managers insert checklist items" on public.checklist_items for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager'));
create policy "managers update checklist items" on public.checklist_items for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager'))
  with check ((select private.my_role()) in ('owner', 'manager'));

create policy "team reads tasks" on public.tasks for select to authenticated
  using ((select private.my_role()) is not null);
create policy "managers insert tasks" on public.tasks for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager'));
-- Staff update the tasks assigned to them (status, checklist, notes); managers update any.
create policy "team updates tasks" on public.tasks for update to authenticated
  using ((select private.my_role()) in ('owner', 'manager') or assigned_to = (select auth.uid()))
  with check ((select private.my_role()) in ('owner', 'manager') or assigned_to = (select auth.uid()));

-- Everyone on the team can see who's who (to show and pick task assignees).
alter policy "read own profile, owners read all" on public.profiles
  using ((select private.my_role()) is not null);
alter policy "read own profile, owners read all" on public.profiles rename to "team reads profiles";

alter publication supabase_realtime add table public.tasks;

-- Default checklists; the family can edit them.
insert into public.checklist_items (property_id, label, sort)
select p.id, item.label, item.sort
from public.properties p
cross join (values
  ('Camas hechas y ropa de cama cambiada', 1),
  ('Baños limpios y toallas cambiadas', 2),
  ('Cocina: limpia, lavavajillas vacío, nevera vacía', 3),
  ('Suelos aspirados y fregados', 4),
  ('Basura retirada y reciclaje', 5),
  ('Terrazas y muebles de exterior', 6),
  ('Piscina revisada', 7),
  ('Reponer: papel, jabón, café, productos de limpieza', 8),
  ('Ventanas cerradas, luces y aire acondicionado apagados', 9),
  ('Desperfectos u objetos olvidados anotados', 10)
) as item (label, sort);

-- Cleaning tasks for reservations that already exist.
insert into public.tasks (unit_id, reservation_id, kind, due_date)
select unit_id, id, 'cleaning', check_out from public.reservations
where kind = 'booking' and status <> 'cancelled' and deleted_at is null
on conflict do nothing;
