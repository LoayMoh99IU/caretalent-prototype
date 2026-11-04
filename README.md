# CareTalent AI Prototype

A working prototype of the first three features CareTalent AI described for healthcare employers:

1. **Smart job ads**: post one job to many boards, track which boards send qualified clinicians (not just clicks), and move budget toward them.
2. **Hiring dashboards**: spend, applicants, hires and 365-day retention, by job board, role and month, plus an A/B test of two versions of a post.
3. **Ad spend ROI**: what each job-ad dollar bought, from the first click to a hire who stayed a full year.

All data is sample data for a fictional employer, "Riverside Health System."

**Stack:** Next.js 14 (App Router, TypeScript, static export) · Supabase (Postgres, row level security, Realtime) · GitHub Pages.

## How it works

```
Browser (Next.js static site)
   │  reads tables and views          ─►  Postgres (Supabase), row level security: read-only
   │  calls post_job / advance_job /  ─►  SECURITY DEFINER functions that validate input
   │        rebalance_job (RPC)            and keep the demo bounded
   └─ subscribes to jobs + activity   ◄─  Supabase Realtime (live activity feed)
```

### Data model (`supabase/migrations`)

| Table | Holds |
|---|---|
| `employers` | hospitals, health centers, staffing firms |
| `job_boards` | Indeed, LinkedIn, Vivian Health… with cost per click and conversion rates |
| `roles` | ICU RN, ED RN, Med/Surg RN, NP, PA, CRNA |
| `jobs` | each opening: title, role, location, monthly budget, days live |
| `postings` | one job on one board, with its share of the budget |
| `posting_daily` | spend, clicks, applicants, qualified and hires per posting per day |
| `activity` | the live feed (new applicants, accepted offers, rebalances) |
| `hiring_monthly` | 18 months of history behind the dashboard and ROI views |
| `ab_tests` | two versions of a post with views, applies and qualified applicants |

`posting_totals` is a view that sums `posting_daily` per job and board.

### Security

- Every table has row level security with **read-only** policies. The browser cannot insert, update or delete rows directly.
- The only writes are three functions: `post_job`, `advance_job` and `rebalance_job`. They validate every argument and cap the demo (30 visitor-posted jobs, 14 days per call, 365 days per job, 60 feed items per job), so the public demo can't be used to fill the database.
- Supabase's advisor flags these functions as callable by anonymous users. That is intentional for a public demo; a real product would require sign-in and scope every row to the user's employer.

### Budget rebalancing

`rebalance_job` weights each board by qualified applicants per dollar raised to the power 1.5, keeps every board at a 4% floor so the system keeps learning, and normalizes the shares. The UI previews the same calculation before you apply it.

### A/B test

A two-proportion z-test on apply rate (applications ÷ views), with the sample size needed at 95% confidence and 80% power when the result isn't significant yet.

## Run it locally

```bash
npm install
npm run dev
```

It connects to the demo Supabase project by default. To use your own, copy `.env.example` to `.env.local`, then run the SQL files in `supabase/migrations` in order (Supabase dashboard → SQL editor).

## Deploy

Pushing to `main` builds the static site and publishes it to GitHub Pages (`.github/workflows/deploy.yml`). In the repo's **Settings → Pages**, set **Source** to **GitHub Actions** once.

`public/standalone.html` is the earlier single-file version that saves to the browser instead of a database.

---

Prepared by Loay Mahmoud.
