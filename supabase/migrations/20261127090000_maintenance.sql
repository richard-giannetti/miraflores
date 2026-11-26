-- Wave 2: maintenance. Anyone on the team reports an issue (with photos) from their phone; managers
-- assign and follow it. Recurring jobs (pool, garden, AC service, extinguishers…) open an issue on their
-- own when they come due, and completing that issue schedules the next one.

create type public.issue_status as enum ('open', 'in_progress', 'waiting', 'done');
create type public.issue_priority as enum ('low', 'normal', 'urgent');
create type public.repeat_unit as enum ('week', 'month');

create table public.recurring_jobs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id),
  title text not null,
  notes text not null default '',
  every integer not null check (every between 1 and 60),
  unit public.repeat_unit not null default 'month',
  next_due date not null,
  assigned_to uuid references public.profiles (id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index recurring_jobs_property_id_idx on public.recurring_jobs (property_id);
create index recurring_jobs_assigned_to_idx on public.recurring_jobs (assigned_to);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id),
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  -- Where in the villa: "pool", "kitchen", "bedroom 2"…
  location text not null default '',
  priority public.issue_priority not null default 'normal',
  status public.issue_status not null default 'open',
  -- Storage paths in the private issue-photos bucket.
  photos text[] not null default '{}',
  assigned_to uuid references public.profiles (id),
  due_date date,
  recurring_job_id uuid references public.recurring_jobs (id),
  cost numeric(10, 2) check (cost is null or cost >= 0),
  resolution text not null default '',
  reported_by uuid references auth.users (id) default auth.uid(),
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index issues_property_id_idx on public.issues (property_id);
create index issues_assigned_to_idx on public.issues (assigned_to);
create index issues_recurring_job_id_idx on public.issues (recurring_job_id);
create index issues_reported_by_idx on public.issues (reported_by);
create index issues_resolved_by_idx on public.issues (resolved_by);
create index issues_open_idx on public.issues (status) where deleted_at is null and status <> 'done';
-- A recurring job has at most one issue still open.
create unique index issues_one_open_per_job_idx on public.issues (recurring_job_id) where recurring_job_id is not null and status <> 'done' and deleted_at is null;

create trigger recurring_jobs_updated_at before update on public.recurring_jobs for each row execute function public.set_updated_at();
create trigger issues_updated_at before update on public.issues for each row execute function public.set_updated_at();

-- Who closed it and when; for a recurring job, the next due date counts from the day it was done.
create function private.issue_done() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    new.resolved_at := now();
    new.resolved_by := auth.uid();
    if new.recurring_job_id is not null then
      update public.recurring_jobs j
        set next_due = (now() at time zone 'Europe/Madrid')::date
                       + case j.unit when 'week' then make_interval(weeks => j.every) else make_interval(months => j.every) end
        where j.id = new.recurring_job_id;
    end if;
  elsif new.status <> 'done' and old.status = 'done' then
    new.resolved_at := null;
    new.resolved_by := null;
  end if;
  return new;
end;
$$;
create trigger issues_done before update of status on public.issues for each row execute function private.issue_done();

-- Open an issue for every active job due within the next 7 days that doesn't already have one.
create function private.spawn_recurring_issues() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into public.issues (property_id, title, description, assigned_to, due_date, recurring_job_id, reported_by)
  select j.property_id, j.title, j.notes, j.assigned_to, j.next_due, j.id, null
  from public.recurring_jobs j
  where j.active and j.deleted_at is null
    and j.next_due <= (now() at time zone 'Europe/Madrid')::date + 7
    and not exists (
      select 1 from public.issues i
      where i.recurring_job_id = j.id and i.status <> 'done' and i.deleted_at is null
    );
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function private.spawn_recurring_issues() from public, anon, authenticated;

-- A job created or rescheduled close to its date shows up straight away, not the next night.
create function private.recurring_job_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.spawn_recurring_issues();
  return null;
end;
$$;
create trigger recurring_jobs_spawn after insert or update of next_due, active, deleted_at on public.recurring_jobs
  for each statement execute function private.recurring_job_changed();
create trigger issues_spawn_next after update of status on public.issues
  for each statement execute function private.recurring_job_changed();

select cron.schedule('spawn-recurring-issues', '15 4 * * *', $$select private.spawn_recurring_issues()$$);

-- Access: everyone on the team sees and reports issues; the person assigned (or who reported it) can work
-- on it; managers manage everything, including recurring jobs. Nothing is hard-deleted.
alter table public.recurring_jobs enable row level security;
alter table public.issues enable row level security;

create policy "team reads jobs" on public.recurring_jobs for select to authenticated using ((select private.my_role()) is not null);
create policy "managers manage jobs" on public.recurring_jobs for all to authenticated
  using ((select private.my_role()) in ('owner', 'manager')) with check ((select private.my_role()) in ('owner', 'manager'));

create policy "team reads issues" on public.issues for select to authenticated using ((select private.my_role()) is not null);
create policy "team reports issues" on public.issues for insert to authenticated
  with check ((select private.my_role()) is not null and reported_by = (select auth.uid()));
create policy "assignee, reporter or managers update issues" on public.issues for update to authenticated
  using (
    (select private.my_role()) in ('owner', 'manager')
    or assigned_to = (select auth.uid())
    or reported_by = (select auth.uid())
  )
  with check (
    (select private.my_role()) in ('owner', 'manager')
    or assigned_to = (select auth.uid())
    or reported_by = (select auth.uid())
  );

alter publication supabase_realtime add table public.issues;

-- Photos: a private bucket; the team uploads and views them (through short-lived signed links).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('issue-photos', 'issue-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "team reads issue photos" on storage.objects for select to authenticated
  using (bucket_id = 'issue-photos' and (select private.my_role()) is not null);
create policy "team uploads issue photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'issue-photos' and (select private.my_role()) is not null);
