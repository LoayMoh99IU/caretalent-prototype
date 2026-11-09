-- Supabase blocks UPDATE statements without a WHERE clause on API requests
-- (pg_safeupdate), so rebalance_job filters its temp-table update explicitly.
-- (Superseded by 0005, which also adds the optimization goal.)
create or replace function public.rebalance_job(p_job uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_days int;
  v_sum numeric;
  v_norm numeric;
begin
  select days_live into v_days from jobs where id = p_job for update;
  if not found then raise exception 'Job not found.'; end if;
  if v_days < 3 then raise exception 'Wait for 3 days of results before rebalancing.'; end if;

  create temp table _w on commit drop as
    select t.board_id, case when t.spend > 0 then power(t.qualified / t.spend, 1.5) else 0 end as w
    from posting_totals t where t.job_id = p_job;
  select sum(w) into v_sum from _w;
  if coalesce(v_sum, 0) = 0 then raise exception 'Not enough qualified applicants yet to rebalance.'; end if;

  update _w set w = greatest(0.04, w / v_sum) where board_id is not null;
  select sum(w) into v_norm from _w;

  update postings ps set budget_share = round(_w.w / v_norm, 4)
  from _w where ps.job_id = p_job and ps.board_id = _w.board_id;

  update jobs set rebalanced = true, updated_at = now() where id = p_job;
  insert into activity (job_id, day, kind, message)
  values (p_job, v_days, 'rebalanced', 'Budget moved toward the boards sending qualified candidates');
end $$;

revoke all on function public.rebalance_job(uuid) from public;
grant execute on function public.rebalance_job(uuid) to anon, authenticated;
