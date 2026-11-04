"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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

// Same rule as rebalance_job() in the database, run here to preview the split.
function recommend(rows: PostingTotal[]) {
  const qpd = rows.map((r) => (r.spend > 0 ? r.qualified / r.spend : 0));
  const w = qpd.map((q) => Math.pow(q, 1.5));
  const sum = w.reduce((a, b) => a + b, 0);
  if (!sum) return null;
  const floored = w.map((x) => Math.max(0.04, x / sum));
  const norm = floored.reduce((a, b) => a + b, 0);
  return { shares: floored.map((x) => x / norm), qpd };
}

export default function AdsView({ boards, roles, jobs, totals, activity, refresh }: Props) {
  const boardById = useMemo(() => Object.fromEntries(boards.map((b) => [b.id, b])), [boards]);
  const roleById = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles]);
  const jobTitle = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j.title])), [jobs]);

  const [title, setTitle] = useState("Med/Surg RN · Days · Sign-on bonus");
  const [role, setRole] = useState("ms");
  const [loc, setLoc] = useState("Indianapolis, IN");
  const [budget, setBudget] = useState(6000);
  const [picked, setPicked] = useState<string[] | null>(null);
  const selected = picked ?? boards.map((b) => b.id);
  const [posting, setPosting] = useState(false);
  const [formMsg, setFormMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [jobError, setJobError] = useState<Record<string, string>>({});
  const seen = useRef<Set<number> | null>(null);

  async function onPost(e: FormEvent) {
    e.preventDefault();
    if (!selected.length) return;
    setPosting(true);
    setFormMsg(null);
    const { error } = await supabase.rpc("post_job", {
      p_title: title, p_role: role, p_location: loc, p_budget: budget, p_boards: selected,
    });
    setPosting(false);
    if (error) setFormMsg({ text: error.message, error: true });
    else {
      setFormMsg({ text: `Posted to ${selected.length} board${selected.length > 1 ? "s" : ""}.` });
      await refresh();
    }
  }

  async function act(jobId: string, fn: "advance_job" | "rebalance_job", days?: number) {
    setBusy((b) => ({ ...b, [jobId]: true }));
    setJobError((m) => ({ ...m, [jobId]: "" }));
    const { error } = fn === "advance_job"
      ? await supabase.rpc("advance_job", { p_job: jobId, p_days: days })
      : await supabase.rpc("rebalance_job", { p_job: jobId });
    if (error) setJobError((m) => ({ ...m, [jobId]: error.message }));
    await refresh();
    setBusy((b) => ({ ...b, [jobId]: false }));
  }

  // highlight feed items that arrived after first render
  const isNew = (id: number) => seen.current !== null && !seen.current.has(id);
  const feed = activity.slice(0, 40);
  useEffect(() => {
    if (activity.length) seen.current = new Set(activity.map((f) => f.id));
  }, [activity]);

  return (
    <section>
      <div className="view-head">
        <div className="rule" />
        <h1>Post once, spend where the hires come from</h1>
        <p className="sub">One job goes out to every board. Each day we count who applied, who is qualified, and who got hired, then move budget toward the boards that send clinicians, not just clicks.</p>
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
            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>Job boards</span>
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
              {posting ? "Posting…" : selected.length ? `Post to ${selected.length} board${selected.length > 1 ? "s" : ""}` : "Pick at least one board"}
            </button>
            {formMsg ? <p className={formMsg.error ? "error" : "empty"}>{formMsg.text}</p> : null}
          </form>

          <div className="panel">
            <div className="panel-head"><h2>Live activity</h2><span className="eyebrow">all jobs</span></div>
            <div className="feed">
              {feed.length === 0 ? <p className="empty">Activity from your jobs shows up here.</p> : feed.map((f) => {
                const color = f.kind === "hire" ? "var(--teal)" : f.board_id ? boardById[f.board_id]?.color : "var(--primary)";
                return (
                  <div key={f.id} className={`feed-item ${f.kind === "hire" ? "hire" : ""} ${isNew(f.id) ? "new" : ""}`}>
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
            const cpq = (r: PostingTotal) => r.spend / Math.max(r.qualified, 0.5);
            const sortedCpq = rows.map(cpq).sort((a, b) => a - b);
            const median = sortedCpq[Math.floor(sortedCpq.length / 2)] || 1;
            const rec = job.days_live >= 3 ? recommend(rows) : null;
            const projCur = rec ? rows.reduce((a, r, i) => a + job.monthly_budget * r.budget_share * rec.qpd[i], 0) : 0;
            const projRec = rec ? rows.reduce((a, r, i) => a + job.monthly_budget * rec.shares[i] * rec.qpd[i], 0) : 0;
            const same = rec ? rows.every((r, i) => Math.abs(r.budget_share - rec.shares[i]) < 0.01) : true;
            const isBusy = !!busy[job.id];
            const seg = (shares: number[]) => rows.map((r, i) => (
              <div key={r.board_id} style={{ flex: `0 0 calc(${(shares[i] * 100).toFixed(2)}% - 2px)`, background: boardById[r.board_id]?.color }}
                data-tip={`${boardById[r.board_id]?.name}: <b>${pct(shares[i])}</b> · ${fmtUSD(job.monthly_budget * shares[i])}/mo`} />
            ));
            const status = job.days_live === 0 ? <span className="chip warn">Posted, waiting for data</span>
              : job.rebalanced ? <span className="chip info">Rebalanced</span> : <span className="chip good">Live</span>;
            const dayButtons = (
              <div className="row">
                <button className="btn small ghost" disabled={isBusy} onClick={() => act(job.id, "advance_job", 1)}>Advance 1 day</button>
                <button className="btn small ghost" disabled={isBusy} onClick={() => act(job.id, "advance_job", 7)}>Advance 7 days</button>
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
                  <span>Boards <b>{rows.length}</b></span>
                </div>
                {job.days_live === 0 ? (
                  <>
                    <p className="empty">Live on {rows.length} boards. Results appear here as candidates click and apply.</p>
                    {dayButtons}
                  </>
                ) : (
                  <>
                    <div className="table-wrap"><table>
                      <thead><tr><th>Board</th><th>Spend</th><th>Clicks</th><th>Applicants</th><th>Qualified</th><th>Hires</th><th>Cost / qualified</th><th style={{ textAlign: "left" }}>Signal</th></tr></thead>
                      <tbody>{rows.map((r) => {
                        const s = signal(cpq(r) / median);
                        return (
                          <tr key={r.board_id}>
                            <td><span className="swatch" style={{ background: boardById[r.board_id]?.color }} />{boardById[r.board_id]?.name}</td>
                            <td>{fmtUSD(r.spend)}</td><td>{fmtN(r.clicks)}</td><td>{fmtN(r.applicants)}</td><td>{fmtN(r.qualified)}</td><td>{fmtN(r.hires)}</td>
                            <td>{r.qualified ? fmtUSD(r.spend / r.qualified) : "–"}</td>
                            <td style={{ textAlign: "left" }}>{job.days_live >= 3 ? <span className={`chip ${s.tone}`}>{s.label}</span> : <span className="chip info">Learning</span>}</td>
                          </tr>
                        );
                      })}</tbody>
                      <tfoot><tr><td>Total</td><td>{fmtUSD(tot.spend)}</td><td>{fmtN(tot.clicks)}</td><td>{fmtN(tot.applicants)}</td><td>{fmtN(tot.qualified)}</td><td>{fmtN(tot.hires)}</td><td>{tot.qualified ? fmtUSD(tot.spend / tot.qualified) : "–"}</td><td /></tr></tfoot>
                    </table></div>
                    <div className="alloc">
                      <div className="alloc-row"><span>{job.rebalanced ? "Now" : "Current split"}</span><div className="bar-stack">{seg(rows.map((r) => r.budget_share))}</div></div>
                      {rec && !same ? <div className="alloc-row"><span>Recommended</span><div className="bar-stack">{seg(rec.shares)}</div></div> : null}
                      <div className="legend">{rows.map((r) => <span key={r.board_id}><span className="swatch" style={{ background: boardById[r.board_id]?.color }} />{boardById[r.board_id]?.name}</span>)}</div>
                    </div>
                    {!rec ? <div className="callout">Still learning which boards work. A budget recommendation appears after 3 days with qualified applicants.</div>
                      : same ? <div className="callout">Budget is already weighted toward the boards that send qualified candidates. Projected <b>{fmtN(projCur)}</b> qualified applicants per month at {fmtUSD(job.monthly_budget)}.</div>
                      : <>
                          <div className="callout">Same {fmtUSD(job.monthly_budget)} monthly budget, projected <b>{fmtN(projRec)}</b> qualified applicants per month instead of <b>{fmtN(projCur)}</b> (<b>+{pct(projRec / Math.max(projCur, 0.01) - 1)}</b>). Every board keeps at least 4% so we keep learning.</div>
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
