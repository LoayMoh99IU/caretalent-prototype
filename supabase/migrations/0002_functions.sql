-- Write path for the demo. Each function validates its input and keeps the
-- database bounded (at most 30 visitor-posted jobs, 365 days per job,
-- 60 activity rows per job). Executed with definer rights so the tables
-- themselves never need write policies.

create or replace function public.demo_employer_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from employers order by created_at limit 1
$$;

create or replace function public.post_job(
  p_title text, p_role text, p_location text, p_budget numeric, p_boards text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_job uuid;
  v_total numeric;
  v_title text := left(btrim(coalesce(p_title, '')), 120);
  v_loc text := left(btrim(coalesce(p_location, '')), 80);
begin
  if v_title = '' then raise exception 'Give the job a title.'; end if;
  if v_loc = '' then v_loc := 'Remote'; end if;
  if p_budget is null or p_budget < 500 or p_budget > 500000 then
    raise exception 'Monthly budget must be between $500 and $500,000.';
  end if;
  if not exists (select 1 from roles where id = p_role) then raise exception 'Unknown role.'; end if;
  if p_boards is null or cardinality(p_boards) = 0 then raise exception 'Pick at least one job board.'; end if;

  select sum(default_share) into v_total from job_boards where id = any(p_boards);
  if v_total is null then raise exception 'Pick at least one job board.'; end if;

  insert into jobs (employer_id, title, role_id, location, monthly_budget)
  values (demo_employer_id(), v_title, p_role, v_loc, round(p_budget))
  returning id into v_job;

  insert into postings (job_id, board_id, budget_share)
  select v_job, id, round(default_share / v_total, 4) from job_boards where id = any(p_boards);

  insert into activity (job_id, day, kind, message)
  values (v_job, 0, 'posted', format('Posted to %s board%s', cardinality(p_boards), case when cardinality(p_boards) > 1 then 's' else '' end));

  -- keep the demo bounded: only the 30 newest visitor-posted jobs stay
  delete from jobs where id in (
    select id from jobs where not is_sample order by created_at desc offset 30
  );
  return v_job;
end $$;

create or replace function public.advance_job(p_job uuid, p_days int default 1)
returns void
language plpgsql security definer set search_path = public as $$
declare
  j record;
  p record;
  v_day int;
  v_ramp numeric;
  v_spend numeric; v_clicks numeric;
  v_app int; v_qual int; v_hires int;
  v_role_name text; v_factor numeric;
  i int;
begin
  if p_days is null or p_days < 1 or p_days > 14 then raise exception 'Advance between 1 and 14 days at a time.'; end if;
  select * into j from jobs where id = p_job for update;
  if not found then raise exception 'Job not found.'; end if;
  if j.days_live + p_days > 365 then raise exception 'This job has reached its 365-day limit.'; end if;
  select name, hire_factor into v_role_name, v_factor from roles where id = j.role_id;

  for i in 1..p_days loop
    v_day := j.days_live + i;
    v_ramp := least(1, v_day / 10.0);
    for p in
      select ps.id, ps.board_id, ps.budget_share, b.name, b.cpc, b.apply_rate, b.qual_rate, b.hire_rate
      from postings ps join job_boards b on b.id = ps.board_id
      where ps.job_id = p_job order by b.sort
    loop
      v_spend  := j.monthly_budget * p.budget_share / 30 * (0.85 + random() * 0.3);
      v_clicks := v_spend / (p.cpc * (0.9 + random() * 0.2));
      v_app    := floor(v_clicks * p.apply_rate * (0.7 + random() * 0.6) + random());
      v_qual   := least(v_app, floor(v_app * p.qual_rate * (0.7 + random() * 0.6) + random())::int);
      v_hires  := least(v_qual, floor(v_qual * p.hire_rate * v_factor * 2.2 * v_ramp * (0.6 + random() * 0.8) + random())::int);

      insert into posting_daily (posting_id, day, spend, clicks, applicants, qualified, hires)
      values (p.id, v_day, round(v_spend, 2), round(v_clicks), v_app, v_qual, v_hires);

      if v_app > 0 then
        insert into activity (job_id, board_id, day, kind, message)
        values (p_job, p.board_id, v_day, 'applicants',
          format('%s new applicant%s via %s%s', v_app, case when v_app > 1 then 's' else '' end, p.name,
                 case when v_qual > 0 then format(', %s qualified', v_qual) else '' end));
      end if;
      if v_hires > 0 then
        insert into activity (job_id, board_id, day, kind, message)
        values (p_job, p.board_id, v_day, 'hire',
          format('%s offer%s accepted: %s via %s', v_hires, case when v_hires > 1 then 's' else '' end, v_role_name, p.name));
      end if;
    end loop;
  end loop;

  update jobs set days_live = j.days_live + p_days, updated_at = now() where id = p_job;

  delete from activity where id in (
    select id from activity where job_id = p_job order by id desc offset 60
  );
end $$;

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

  update _w set w = greatest(0.04, w / v_sum);
  select sum(w) into v_norm from _w;

  update postings ps set budget_share = round(_w.w / v_norm, 4)
  from _w where ps.job_id = p_job and ps.board_id = _w.board_id;

  update jobs set rebalanced = true, updated_at = now() where id = p_job;
  insert into activity (job_id, day, kind, message)
  values (p_job, v_days, 'rebalanced', 'Budget moved toward the boards sending qualified candidates');
end $$;

revoke all on function public.demo_employer_id() from public;
revoke all on function public.post_job(text, text, text, numeric, text[]) from public;
revoke all on function public.advance_job(uuid, int) from public;
revoke all on function public.rebalance_job(uuid) from public;
grant execute on function public.post_job(text, text, text, numeric, text[]) to anon, authenticated;
grant execute on function public.advance_job(uuid, int) to anon, authenticated;
grant execute on function public.rebalance_job(uuid) to anon, authenticated;
