-- CareTalent AI prototype schema
-- Reads are open (sample data only). Writes go through the functions in 0002,
-- which validate input and keep the demo bounded. No table allows direct writes.

create table public.employers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.job_boards (
  id text primary key,
  name text not null,
  cpc numeric not null,              -- cost per click, USD
  apply_rate numeric not null,       -- click -> application
  qual_rate numeric not null,        -- application -> qualified
  hire_rate numeric not null,        -- qualified -> hire
  retention_365 numeric not null,    -- hire -> still employed at 365 days
  default_share numeric not null,    -- starting budget share
  color text not null,
  sort int not null
);

create table public.roles (
  id text primary key,
  name text not null,
  hire_factor numeric not null,      -- how easy this role is to fill
  spend_share numeric not null,
  sort int not null
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employers(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  role_id text not null references public.roles(id),
  location text not null check (char_length(location) between 1 and 80),
  monthly_budget numeric not null check (monthly_budget between 500 and 500000),
  days_live int not null default 0 check (days_live between 0 and 365),
  rebalanced boolean not null default false,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_employer_created on public.jobs (employer_id, created_at desc);

-- one job on one board
create table public.postings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  board_id text not null references public.job_boards(id),
  budget_share numeric not null check (budget_share between 0 and 1),
  unique (job_id, board_id)
);

-- what each posting produced on each day it was live
create table public.posting_daily (
  posting_id uuid not null references public.postings(id) on delete cascade,
  day int not null check (day >= 1),
  spend numeric not null default 0,
  clicks int not null default 0,
  applicants int not null default 0,
  qualified int not null default 0,
  hires int not null default 0,
  primary key (posting_id, day)
);

create table public.activity (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  board_id text references public.job_boards(id),
  day int not null,
  kind text not null check (kind in ('posted', 'applicants', 'hire', 'rebalanced')),
  message text not null,
  created_at timestamptz not null default now()
);
create index activity_job_created on public.activity (job_id, created_at desc);
create index activity_created on public.activity (created_at desc);

-- 18 months of hiring history for the dashboard and ROI views
create table public.hiring_monthly (
  employer_id uuid not null references public.employers(id) on delete cascade,
  month date not null,
  board_id text not null references public.job_boards(id),
  role_id text not null references public.roles(id),
  spend numeric not null,
  clicks numeric not null,
  applicants numeric not null,
  qualified numeric not null,
  interviews numeric not null,
  hires numeric not null,
  retained_90 numeric not null,
  retained_365 numeric,              -- null until the cohort is a year old
  primary key (employer_id, month, board_id, role_id)
);

create table public.ab_tests (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employers(id) on delete cascade,
  name text not null,
  variant text not null,
  headline text not null,
  body text not null,
  views int not null,
  applies int not null,
  qualified int not null,
  unique (employer_id, name, variant)
);

-- per-job, per-board totals
create view public.posting_totals with (security_invoker = true) as
select p.job_id, p.board_id, p.budget_share,
       coalesce(sum(d.spend), 0)      as spend,
       coalesce(sum(d.clicks), 0)     as clicks,
       coalesce(sum(d.applicants), 0) as applicants,
       coalesce(sum(d.qualified), 0)  as qualified,
       coalesce(sum(d.hires), 0)      as hires
from public.postings p
left join public.posting_daily d on d.posting_id = p.id
group by p.job_id, p.board_id, p.budget_share;

-- Row level security: everyone may read the sample data, nobody writes directly.
alter table public.employers      enable row level security;
alter table public.job_boards     enable row level security;
alter table public.roles          enable row level security;
alter table public.jobs           enable row level security;
alter table public.postings       enable row level security;
alter table public.posting_daily  enable row level security;
alter table public.activity       enable row level security;
alter table public.hiring_monthly enable row level security;
alter table public.ab_tests       enable row level security;

create policy "read employers"      on public.employers      for select to anon, authenticated using (true);
create policy "read job_boards"     on public.job_boards     for select to anon, authenticated using (true);
create policy "read roles"          on public.roles          for select to anon, authenticated using (true);
create policy "read jobs"           on public.jobs           for select to anon, authenticated using (true);
create policy "read postings"       on public.postings       for select to anon, authenticated using (true);
create policy "read posting_daily"  on public.posting_daily  for select to anon, authenticated using (true);
create policy "read activity"       on public.activity       for select to anon, authenticated using (true);
create policy "read hiring_monthly" on public.hiring_monthly for select to anon, authenticated using (true);
create policy "read ab_tests"       on public.ab_tests       for select to anon, authenticated using (true);

-- live updates for the activity feed and job cards
alter publication supabase_realtime add table public.activity, public.jobs;
