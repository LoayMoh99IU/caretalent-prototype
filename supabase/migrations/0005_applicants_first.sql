-- Reshape around the founders' priorities: (1) more applicants per job, (2) dashboard.
--  * each job has an optimization goal (applicants or qualified applicants) and a
--    baseline: how many applicants a week the employer got before CareTalent
--  * quick_apply(): a short mobile application with an optional voice intro. It stores
--    only role, state, years, shift and whether a voice intro was recorded, never names,
--    contact details or audio.

alter table public.jobs add column if not exists goal text not null default 'applicants'
  check (goal in ('applicants', 'qualified'));
alter table public.jobs add column if not exists baseline_weekly int not null default 5
  check (baseline_weekly between 0 and 1000);

alter table public.activity drop constraint if exists activity_kind_check;
alter table public.activity add constraint activity_kind_check
  check (kind in ('posted', 'applicants', 'hire', 'rebalanced', 'quick_apply'));

create table if not exists public.quick_applications (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  board_id text not null references public.job_boards(id),
  day int not null,
  role_id text not null references public.roles(id),
  license_state text not null check (license_state ~ '^[A-Z]{2}$'),
  years int not null check (years between 0 and 50),
  shift text not null check (shift in ('Days', 'Nights', 'Flexible')),
  voice_intro boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists quick_applications_job on public.quick_applications (job_id, created_at desc);
-- No select policy: the browser can't read these rows; only the counts it adds to jobs.
alter table public.quick_applications enable row level security;

-- post_job with goal and baseline
drop function if exists public.post_job(text, text, text, numeric, text[]);
create or replace function public.post_job(
  p_title text, p_role text, p_location text, p_budget numeric, p_boards text[],
  p_goal text default 'applicants', p_baseline int default 5
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
  if p_boards is null or cardinality(p_boards) = 0 then raise exception 'Pick at least one channel.'; end if;
  if p_goal not in ('applicants', 'qualified') then raise exception 'Unknown goal.'; end if;
  if p_baseline is null or p_baseline < 0 or p_baseline > 1000 then raise exception 'Baseline must be between 0 and 1,000.'; end if;

  select sum(default_share) into v_total from job_boards where id = any(p_boards);
  if v_total is null then raise exception 'Pick at least one channel.'; end if;

  insert into jobs (employer_id, title, role_id, location, monthly_budget, goal, baseline_weekly)
  values (demo_employer_id(), v_title, p_role, v_loc, round(p_budget), p_goal, p_baseline)
  returning id into v_job;

  insert into postings (job_id, board_id, budget_share)
  select v_job, id, round(default_share / v_total, 4) from job_boards where id = any(p_boards);

  insert into activity (job_id, day, kind, message)
  values (v_job, 0, 'posted', format('Sent to %s channel%s through the programmatic partner',
          cardinality(p_boards), case when cardinality(p_boards) > 1 then 's' else '' end));

  delete from jobs where id in (
    select id from jobs where not is_sample order by created_at desc offset 30
  );
  return v_job;
end $$;

-- rebalance toward the job's goal: applicants per dollar, or qualified applicants per dollar
create or replace function public.rebalance_job(p_job uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_days int;
  v_goal text;
  v_sum numeric;
  v_norm numeric;
begin
  select days_live, goal into v_days, v_goal from jobs where id = p_job for update;
  if not found then raise exception 'Job not found.'; end if;
  if v_days < 3 then raise exception 'Wait for 3 days of results before rebalancing.'; end if;

  create temp table _w on commit drop as
    select t.board_id,
           case when t.spend > 0
                then power((case when v_goal = 'qualified' then t.qualified else t.applicants end) / t.spend, 1.5)
                else 0 end as w
    from posting_totals t where t.job_id = p_job;
  select sum(w) into v_sum from _w;
  if coalesce(v_sum, 0) = 0 then raise exception 'Not enough applicants yet to rebalance.'; end if;

  update _w set w = greatest(0.04, w / v_sum) where board_id is not null;
  select sum(w) into v_norm from _w;

  update postings ps set budget_share = round(_w.w / v_norm, 4)
  from _w where ps.job_id = p_job and ps.board_id = _w.board_id;

  update jobs set rebalanced = true, updated_at = now() where id = p_job;
  insert into activity (job_id, day, kind, message)
  values (p_job, v_days, 'rebalanced',
          case when v_goal = 'qualified'
               then 'Budget moved toward the channels sending qualified candidates'
               else 'Budget moved toward the channels sending the most applicants per dollar' end);
end $$;

-- change a job's goal
create or replace function public.set_job_goal(p_job uuid, p_goal text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_goal not in ('applicants', 'qualified') then raise exception 'Unknown goal.'; end if;
  update jobs set goal = p_goal, updated_at = now() where id = p_job;
  if not found then raise exception 'Job not found.'; end if;
end $$;

-- a candidate applies from their phone in under a minute
create or replace function public.quick_apply(
  p_job uuid, p_board text, p_role text, p_state text, p_years int, p_shift text, p_voice boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  j record;
  v_posting uuid;
  v_day int;
  v_board_name text;
  v_recent int;
begin
  select * into j from jobs where id = p_job for update;
  if not found then raise exception 'Job not found.'; end if;
  select id into v_posting from postings where job_id = p_job and board_id = p_board;
  if v_posting is null then raise exception 'This job is not on that channel.'; end if;
  if not exists (select 1 from roles where id = p_role) then raise exception 'Unknown role.'; end if;
  if p_state is null or p_state !~ '^[A-Z]{2}$' then raise exception 'Pick a license state.'; end if;
  if p_years is null or p_years < 0 or p_years > 50 then raise exception 'Years must be between 0 and 50.'; end if;
  if p_shift not in ('Days', 'Nights', 'Flexible') then raise exception 'Pick a shift.'; end if;

  -- keep the public demo bounded
  select count(*) into v_recent from quick_applications where created_at > now() - interval '1 minute';
  if v_recent >= 30 then raise exception 'Too many demo applications right now. Try again in a minute.'; end if;

  v_day := greatest(j.days_live, 1);
  insert into quick_applications (job_id, board_id, day, role_id, license_state, years, shift, voice_intro)
  values (p_job, p_board, v_day, p_role, p_state, p_years, p_shift, coalesce(p_voice, false));

  insert into posting_daily (posting_id, day, applicants, qualified)
  values (v_posting, v_day, 1, case when p_role = j.role_id and p_years >= 2 then 1 else 0 end)
  on conflict (posting_id, day) do update
    set applicants = posting_daily.applicants + 1,
        qualified = posting_daily.qualified + excluded.qualified;

  if j.days_live = 0 then update jobs set days_live = 1 where id = p_job; end if;
  update jobs set updated_at = now() where id = p_job;

  select name into v_board_name from job_boards where id = p_board;
  insert into activity (job_id, board_id, day, kind, message)
  values (p_job, p_board, v_day, 'quick_apply',
          format('Quick apply via %s: %s yrs, %s license%s', v_board_name, p_years, p_state,
                 case when coalesce(p_voice, false) then ', with voice intro' else '' end));

  delete from quick_applications where id in (
    select id from quick_applications order by id desc offset 500
  );
end $$;

update public.jobs set baseline_weekly = 32 where title like 'ICU RN%' and is_sample;
update public.jobs set baseline_weekly = 26 where title like 'CRNA%' and is_sample;
update public.jobs set baseline_weekly = 22 where title like 'Med/Surg%';

revoke all on function public.post_job(text, text, text, numeric, text[], text, int) from public;
revoke all on function public.rebalance_job(uuid) from public;
revoke all on function public.set_job_goal(uuid, text) from public;
revoke all on function public.quick_apply(uuid, text, text, text, int, text, boolean) from public;
grant execute on function public.post_job(text, text, text, numeric, text[], text, int) to anon, authenticated;
grant execute on function public.rebalance_job(uuid) to anon, authenticated;
grant execute on function public.set_job_goal(uuid, text) to anon, authenticated;
grant execute on function public.quick_apply(uuid, text, text, text, int, text, boolean) to anon, authenticated;
