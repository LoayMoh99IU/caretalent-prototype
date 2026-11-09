"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Kpis from "./Kpis";
import { supabase } from "@/lib/supabase";
import { fmtN, fmtUSD, pct, signal } from "@/lib/format";
import type { Activity, Board, Job, PostingTotal, Role } from "@/lib/types";

type Props = {
  boards: Board[];
  roles: Role[];
  jobs: Job[];
  totals: PostingTotal[];
  activity: Activity[];
  refresh: () => Promise<void>;
};

type Goal = Job["goal"];
const GOAL_LABEL: Record<Goal, string> = { applicants: "More applicants", qualified: "More qualified applicants" };
const metricOf = (r: PostingTotal, goal: Goal) => (goal === "qualified" ? r.qualified : r.applicants);

// Same rule as rebalance_job() in the database, run here to preview the split.
function recommend(rows: PostingTotal[], goal: Goal) {
  const perDollar = rows.map((r) => (r.spend > 0 ? metricOf(r, goal) / r.spend : 0));
  const w = perDollar.map((q) => Math.pow(q, 1.5));
  const sum = w.reduce((a, b) => a + b, 0);
  if (!sum) return null;
  const floored = w.map((x) => Math.max(0.04, x / sum));
  const norm = floored.reduce((a, b) => a + b, 0);
  return { shares: floored.map((x) => x / norm), perDollar };
}

const perWeek = (applicants: number, days: number) => (days > 0 ? (applicants / days) * 7 : 0);

export default function AdsView({ boards, roles, jobs, totals, activity, refresh }: Props) {
  const boardById = useMemo(() => Object.fromEntries(boards.map((b) => [b.id, b])), [boards]);
  const roleById = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles]);
  const jobTitle = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j.title])), [jobs]);

  const [title, setTitle] = useState("Med/Surg RN · Days · Sign-on bonus");
  const [role, setRole] = useState("ms");
  const [loc, setLoc] = useState("Indianapolis, IN");
  const [budget, setBudget] = useState(6000);
  const [goal, setGoal] = useState<Goal>("applicants");
  const [baseline, setBaseline] = useState(20);
  const [picked, setPicked] = useState<string[] | null>(null);
  const selected = picked ?? boards.map((b) => b.id);
  const [posting, setPosting] = useState(false);
  const [formMsg, setFormMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [jobError, setJobError] = useState<Record<string, string>>({});
  const seen = useRef<Set<number> | null>(null);

  // portfolio summary: applicants per job per week, now vs. before CareTalent
  const live = jobs.filter((j) => j.days_live > 0);
  const sumBy = (job: Job) => totals.filter((t) => t.job_id === job.id).reduce(
    (a, r) => ({ spend: a.spend + r.spend, applicants: a.applicants + r.applicants, qualified: a.qualified + r.qualified }),
    { spend: 0, applicants: 0, qualified: 0 });
  const nowWeekly = live.length ? live.reduce((a, j) => a + perWeek(sumBy(j).applicants, j.days_live), 0) / live.length : 0;
  const beforeWeekly = live.length ? live.reduce((a, j) => a + j.baseline_weekly, 0) / live.length : 0;
  const allSpend = live.reduce((a, j) => a + sumBy(j).spend, 0);
  const allApps = live.reduce((a, j) => a + sumBy(j).applicants, 0);
  const lift = beforeWeekly > 0 ? nowWeekly / beforeWeekly - 1 : 0;

  async function onPost(e: FormEvent) {
    e.preventDefault();
    if (!selected.length) return;
    setPosting(true);
    setFormMsg(null);
    const { error } = await supabase.rpc("post_job", {
      p_title: title, p_role: role, p_location: loc, p_budget: budget, p_boards: selected,
      p_goal: goal, p_baseline: baseline,
    });
    setPosting(false);
    if (error) setFormMsg({ text: error.message, error: true });
    else {
      setFormMsg({ text: `Sent to ${selected.length} channel${selected.length > 1 ? "s" : ""}.` });
      await refresh();
    }
  }

  async function act(jobId: string, fn: "advance_job" | "rebalance_job" | "set_job_goal", arg?: number | Goal) {
    setBusy((b) => ({ ...b, [jobId]: true }));
    setJobError((m) => ({ ...m, [jobId]: "" }));
    const { error } =
      fn === "advance_job" ? await supabase.rpc("advance_job", { p_job: jobId, p_days: arg })
      : fn === "set_job_goal" ? await supabase.rpc("set_job_goal", { p_job: jobId, p_goal: arg })
      : await supabase.rpc("rebalance_job", { p_job: jobId });
    if (error) setJobError((m) => ({ ...m, [jobId]: error.message }));
    await refresh();
    setBusy((b) => ({ ...b, [jobId]: false }));
  }

  const isNew = (id: number) => seen.current !== null && !seen.current.has(id);
  const feed = activity.slice(0, 40);
  useEffect(() => {
    if (activity.length) seen.current = new Set(activity.map((f) => f.id));
  }, [activity]);

  return (
    <section>
      <div className="view-head">
        <div className="rule" />
        <span className="eyebrow">Priority 1</span>
        <h1>Get more applicants for every job</h1>
        <p className="sub">Each job goes out once, through a programmatic job-ad partner such as Joveo, to every channel clinicians use. Each day we count applicants and cost per applicant per channel, then move budget toward the channels that bring the most.</p>
      </div>

      <div className="stack" style={{ marginBottom: 16 }}>
        <Kpis items={[
          { label: "Applicants per job, per week", value: live.length ? nowWeekly.toFixed(1) : "–", note: `before CareTalent: ${beforeWeekly.toFixed(1)}` },
          { label: "Change vs. before", value: live.length ? (lift >= 0 ? "+" : "") + pct(lift) : "–", note: "the pilot's main metric" },
          { label: "Cost per applicant", value: allApps ? fmtUSD(allSpend / allApps) : "–", note: "all live jobs" },
          { label: "Jobs live", value: String(live.length), note: `${fmtN(allApps)} applicants so far` },
        ]} />
      </div>

      <div className="grid-side">
        <div className="stack">
          <form className="panel stack" onSubmit={onPost} autoComplete="off">
            <h2>Post a new job</h2>
            <label className="field">Job title
              <input type="text" id="pf-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label className="field">Role
              <select id="pf-role" value={role} onChange={(e) => setRole(e.target.value)}>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="field">Location
              <input type="text" id="pf-loc" value={loc} maxLength={80} onChange={(e) => setLoc(e.target.value)} />
            </label>
            <label className="field">Monthly ad budget (USD)
              <input type="number" id="pf-budget" min={500} max={500000} step={500} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
            </label>
            <label className="field">Optimize for
              <select id="pf-goal" value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
                <option value="applicants">{GOAL_LABEL.applicants}</option>
                <option value="qualified">{GOAL_LABEL.qualified}</option>
              </select>
            </label>
            <label className="field">Applicants per week today, before CareTalent
              <input type="number" id="pf-baseline" min={0} max={1000} value={baseline} onChange={(e) => setBaseline(Number(e.target.value))} />
            </label>
            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>Channels (through the programmatic partner)</span>
              <div className="checks">
                {boards.map((b) => (
                  <label key={b.id}>
                    <input type="checkbox" id={`pf-b-${b.id}`} checked={selected.includes(b.id)}
                      onChange={(e) => setPicked(e.target.checked ? [...selected, b.id] : selected.filter((x) => x !== b.id))} />
                    {b.name}
                  </label>
                ))}
              </div>
            </div>
            <button className="btn" type="submit" disabled={!selected.length || posting}>
              {posting ? "Sending…" : selected.length ? `Send to ${selected.length} channel${selected.length > 1 ? "s" : ""}` : "Pick at least one channel"}
            </button>
            {formMsg ? <p className={formMsg.error ? "error" : "empty"}>{formMsg.text}</p> : null}
          </form>

          <div className="panel">
            <div className="panel-head"><h2>Live activity</h2><span className="eyebrow">all jobs</span></div>
            <div className="feed">
              {feed.length === 0 ? <p className="empty">Activity from your jobs shows up here.</p> : feed.map((f) => {
                const color = f.kind === "hire" || f.kind === "quick_apply" ? "var(--teal)" : f.board_id ? boardById[f.board_id]?.color : "var(--primary)";
                return (
                  <div key={f.id} className={`feed-item ${f.kind === "hire" || f.kind === "quick_apply" ? "hire" : ""} ${isNew(f.id) ? "new" : ""}`}>
                    <span className="dot" style={{ background: color }} />
                    <div>{f.message}<div className="meta">Day {f.day} · {jobTitle[f.job_id] ?? "Job"}</div></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="stack">
          {jobs.length === 0 ? (
            <div className="panel"><h2>No jobs posted yet</h2><p className="empty">Post your first job on the left. Results appear here day by day.</p></div>
          ) : jobs.map((job) => {
            const rows = totals.filter((t) => t.job_id === job.id).sort((a, b) => (boardById[a.board_id]?.sort ?? 0) - (boardById[b.board_id]?.sort ?? 0));
            const tot = rows.reduce((a, r) => ({ spend: a.spend + r.spend, clicks: a.clicks + r.clicks, applicants: a.applicants + r.applicants, qualified: a.qualified + r.qualified, hires: a.hires + r.hires }), { spend: 0, clicks: 0, applicants: 0, qualified: 0, hires: 0 });
            const costPer = (r: PostingTotal) => r.spend / Math.max(metricOf(r, job.goal), 0.5);
            const sortedCost = rows.map(costPer).sort((a, b) => a - b);
            const median = sortedCost[Math.floor(sortedCost.length / 2)] || 1;
            const rec = job.days_live >= 3 ? recommend(rows, job.goal) : null;
            const projCur = rec ? rows.reduce((a, r, i) => a + job.monthly_budget * r.budget_share * rec.perDollar[i], 0) : 0;
            const projRec = rec ? rows.reduce((a, r, i) => a + job.monthly_budget * rec.shares[i] * rec.perDollar[i], 0) : 0;
            const same = rec ? rows.every((r, i) => Math.abs(r.budget_share - rec.shares[i]) < 0.01) : true;
            const isBusy = !!busy[job.id];
            const weekly = perWeek(tot.applicants, job.days_live);
            const jobLift = job.baseline_weekly > 0 ? weekly / job.baseline_weekly - 1 : 0;
            const unit = job.goal === "qualified" ? "qualified applicants" : "applicants";
            const seg = (shares: number[]) => rows.map((r, i) => (
              <div key={r.board_id} style={{ flex: `0 0 calc(${(shares[i] * 100).toFixed(2)}% - 2px)`, background: boardById[r.board_id]?.color }}
                data-tip={`${boardById[r.board_id]?.name}: <b>${pct(shares[i])}</b> · ${fmtUSD(job.monthly_budget * shares[i])}/mo`} />
            ));
            const status = job.days_live === 0 ? <span className="chip warn">Sent, waiting for data</span>
              : job.rebalanced ? <span className="chip info">Rebalanced</span> : <span className="chip good">Live</span>;
            const dayButtons = (
              <div className="row">
                <button className="btn small ghost" disabled={isBusy} onClick={() => act(job.id, "advance_job", 1)}>Simulate 1 day</button>
                <button className="btn small ghost" disabled={isBusy} onClick={() => act(job.id, "advance_job", 7)}>Simulate 7 days</button>
                {isBusy ? <span className="empty">Updating…</span> : null}
              </div>
            );
            return (
              <article className="panel campaign" key={job.id}>
                <div className="panel-head" style={{ margin: 0 }}><h2>{job.title}</h2>{status}</div>
                <div className="camp-meta">
                  <span>Role <b>{roleById[job.role_id]?.name}</b></span>
                  <span>Location <b>{job.location}</b></span>
                  <span>Budget <b>{fmtUSD(job.monthly_budget)}/mo</b></span>
                  <span>Live <b>{job.days_live} day{job.days_live === 1 ? "" : "s"}</b></span>
                  <label className="row" style={{ gap: 6 }}>Optimize for
                    <select value={job.goal} disabled={isBusy} onChange={(e) => act(job.id, "set_job_goal", e.target.value as Goal)}
                      style={{ width: "auto", padding: "4px 8px", fontSize: 13 }} aria-label="Optimize for">
                      <option value="applicants">{GOAL_LABEL.applicants}</option>
                      <option value="qualified">{GOAL_LABEL.qualified}</option>
                    </select>
                  </label>
                </div>
                {job.days_live === 0 ? (
                  <>
                    <p className="empty">Live on {rows.length} channels. Results appear here as clinicians click and apply.</p>
                    {dayButtons}
                  </>
                ) : (
                  <>
                    <div className="callout">
                      <b>{weekly.toFixed(1)}</b> applicants a week, vs. <b>{job.baseline_weekly}</b> before CareTalent
                      {job.baseline_weekly > 0 ? <> (<b>{jobLift >= 0 ? "+" : ""}{pct(jobLift)}</b>)</> : null}.
                      Cost per applicant: <b>{tot.applicants ? fmtUSD(tot.spend / tot.applicants) : "–"}</b>.
                    </div>
                    <div className="table-wrap"><table>
                      <thead><tr><th>Channel</th><th>Spend</th><th>Clicks</th><th>Applicants</th><th>Cost / applicant</th><th>Qualified</th><th>Hires</th><th style={{ textAlign: "left" }}>Signal</th></tr></thead>
                      <tbody>{rows.map((r) => {
                        const s = signal(costPer(r) / median);
                        return (
                          <tr key={r.board_id}>
                            <td><span className="swatch" style={{ background: boardById[r.board_id]?.color }} />{boardById[r.board_id]?.name}</td>
                            <td>{fmtUSD(r.spend)}</td><td>{fmtN(r.clicks)}</td><td>{fmtN(r.applicants)}</td>
                            <td>{r.applicants ? fmtUSD(r.spend / r.applicants) : "–"}</td>
                            <td>{fmtN(r.qualified)}</td><td>{fmtN(r.hires)}</td>
                            <td style={{ textAlign: "left" }}>{job.days_live >= 3 ? <span className={`chip ${s.tone}`}>{s.label}</span> : <span className="chip info">Learning</span>}</td>
                          </tr>
                        );
                      })}</tbody>
                      <tfoot><tr><td>Total</td><td>{fmtUSD(tot.spend)}</td><td>{fmtN(tot.clicks)}</td><td>{fmtN(tot.applicants)}</td><td>{tot.applicants ? fmtUSD(tot.spend / tot.applicants) : "–"}</td><td>{fmtN(tot.qualified)}</td><td>{fmtN(tot.hires)}</td><td /></tr></tfoot>
                    </table></div>
                    <div className="alloc">
                      <div className="alloc-row"><span>{job.rebalanced ? "Now" : "Current split"}</span><div className="bar-stack">{seg(rows.map((r) => r.budget_share))}</div></div>
                      {rec && !same ? <div className="alloc-row"><span>Recommended</span><div className="bar-stack">{seg(rec.shares)}</div></div> : null}
                      <div className="legend">{rows.map((r) => <span key={r.board_id}><span className="swatch" style={{ background: boardById[r.board_id]?.color }} />{boardById[r.board_id]?.name}</span>)}</div>
                    </div>
                    {!rec ? <p className="empty">Still learning which channels work. A budget recommendation appears after 3 days.</p>
                      : same ? <p className="empty">Budget is already weighted toward the channels with the most {unit} per dollar.</p>
                      : <>
                          <p className="empty">Same {fmtUSD(job.monthly_budget)} a month, projected <b style={{ color: "var(--fg)" }}>{fmtN(projRec)}</b> {unit} a month instead of {fmtN(projCur)} (<b style={{ color: "var(--fg)" }}>+{pct(projRec / Math.max(projCur, 0.01) - 1)}</b>). Every channel keeps at least 4% so we keep learning.</p>
                          <div className="row"><button className="btn small" disabled={isBusy} onClick={() => act(job.id, "rebalance_job")}>Move budget to recommended split</button></div>
                        </>}
                    {dayButtons}
                  </>
                )}
                {jobError[job.id] ? <p className="error">{jobError[job.id]}</p> : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
