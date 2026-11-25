-- Tick or untick one checklist item atomically, so quick taps (or two people) never overwrite each other.
-- Runs with the caller's rights: the tasks update policy still decides who may do it.
create function public.set_task_check(p_task uuid, p_item uuid, p_on boolean) returns void
language sql security invoker set search_path = '' as $$
  update public.tasks
  set checked = case
    when p_on then (select array_agg(distinct x) from unnest(checked || p_item) as x)
    else array_remove(checked, p_item)
  end
  where id = p_task;
$$;
revoke execute on function public.set_task_check(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_task_check(uuid, uuid, boolean) to authenticated;
