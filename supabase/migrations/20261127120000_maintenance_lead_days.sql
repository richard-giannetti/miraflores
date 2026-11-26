-- Recurring jobs: open the issue a week ahead, but three days per week of interval for short ones,
-- so a weekly job isn't always open.
create or replace function private.spawn_recurring_issues() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into public.issues (property_id, title, description, assigned_to, due_date, recurring_job_id, reported_by)
  select j.property_id, j.title, j.notes, j.assigned_to, j.next_due, j.id, null
  from public.recurring_jobs j
  where j.active and j.deleted_at is null
    and j.next_due <= (now() at time zone 'Europe/Madrid')::date + case when j.unit = 'week' then least(7, 3 * j.every) else 7 end
    and not exists (
      select 1 from public.issues i
      where i.recurring_job_id = j.id and i.status <> 'done' and i.deleted_at is null
    );
  get diagnostics n = row_count;
  return n;
end;
$$;
