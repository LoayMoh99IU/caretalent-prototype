"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Board, Job, Role } from "@/lib/types";

const STATES = ["IN", "IL", "OH", "KY", "MI", "WI", "TX", "FL", "CA", "NY", "PA", "NC", "GA", "AZ", "TN"];
const SHIFTS = ["Days", "Nights", "Flexible"] as const;

type Props = { boards: Board[]; roles: Role[]; jobs: Job[]; refresh: () => Promise<void> };

// A clinician's view: apply from a phone in under a minute, add a short voice intro,
// then see matching jobs. Nothing personal is stored (see quick_apply in 0005).
export default function CandidateView({ boards, roles, jobs, refresh }: Props) {
  const roleById = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles]);
  const [jobId, setJobId] = useState(jobs[0]?.id ?? "");
  const job = jobs.find((j) => j.id === jobId) ?? jobs[0];
  const [source, setSource] = useState(boards[2]?.id ?? boards[0]?.id ?? "");
  const [role, setRole] = useState(job?.role_id ?? "icu");
  const [state, setState] = useState("IN");
  const [years, setYears] = useState(4);
  const [shift, setShift] = useState<(typeof SHIFTS)[number]>("Nights");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [voice, setVoice] = useState(false);
  const [step, setStep] = useState<"apply" | "done">("apply");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { if (job) setRole(job.role_id); }, [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function toggleRecord() {
    if (recording) {
      if (timer.current) clearInterval(timer.current);
      setRecording(false);
      setVoice(seconds > 0);
      return;
    }
    setSeconds(0);
    setVoice(false);
    setRecording(true);
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= 60) {
          if (timer.current) clearInterval(timer.current);
          setRecording(false);
          setVoice(true);
          return 60;
        }
        return s + 1;
      });
    }, 1000);
  }

  async function apply(target: Job, e?: FormEvent) {
    e?.preventDefault();
    setSending(true);
    setError("");
    const onJob = target.id === job?.id ? source : boards[0]?.id;
    const { error } = await supabase.rpc("quick_apply", {
      p_job: target.id, p_board: onJob, p_role: role, p_state: state, p_years: years, p_shift: shift, p_voice: voice,
    });
    setSending(false);
    if (error) { setError(error.message); return; }
    setApplied((a) => [...a, target.id]);
    setStep("done");
    await refresh();
  }

  const suggestions = jobs
    .filter((j) => j.id !== job?.id && !applied.includes(j.id))
    .sort((a, b) => Number(b.role_id === role) - Number(a.role_id === role))
    .slice(0, 3);

  const mmss = (s: number) => `0:${String(s).padStart(2, "0")}`;

  if (!job) return <p className="skeleton">Post a job first to try the candidate side.</p>;

  return (
    <section>
      <div className="view-head">
        <div className="rule" />
        <span className="eyebrow">Priority 1 · the candidate side</span>
        <h1>Make applying take under a minute</h1>
        <p className="sub">Most applicants quit long applications, especially on a phone. A clinician answers four questions, can add a short voice intro instead of uploading a resume, and then sees other jobs that match.</p>
      </div>

      <div className="cand-grid">
        <div className="phone" aria-label="Phone preview of the candidate application">
          <div className="phone-bar"><span>CareTalent <b style={{ color: "var(--primary)" }}>AI</b></span><span className="eyebrow">Quick apply</span></div>
          {step === "apply" ? (
            <form className="stack" onSubmit={(e) => apply(job, e)} style={{ gap: 12 }}>
              <div className="posting">
                <div className="t">{job.title}</div>
                <p>{job.location} · {roleById[job.role_id]?.name}</p>
              </div>
              <label className="field">Your role
                <select id="ca-role" value={role} onChange={(e) => setRole(e.target.value)}>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <div className="vstats">
                <label className="field">License state
                  <select id="ca-state" value={state} onChange={(e) => setState(e.target.value)}>
                    {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="field">Years
                  <input type="number" id="ca-years" min={0} max={50} value={years} onChange={(e) => setYears(Math.max(0, Math.min(50, Number(e.target.value) || 0)))} />
                </label>
              </div>
              <div className="field">Preferred shift
                <div className="seg">
                  {SHIFTS.map((s) => (
                    <button type="button" key={s} className={shift === s ? "on" : ""} aria-pressed={shift === s} onClick={() => setShift(s)}>{s}</button>
                  ))}
                </div>
              </div>
              <div className="voice">
                <button type="button" className={`mic ${recording ? "rec" : ""}`} onClick={toggleRecord} aria-pressed={recording}>
                  {recording ? "Stop" : voice ? "Re-record" : "Record"}
                </button>
                <div>
                  <b>{recording ? `Recording… ${mmss(seconds)}` : voice ? `Voice intro added (${mmss(seconds)})` : "Add a 60-second voice intro"}</b>
                  <div className="meta">Optional, instead of a resume. Simulated here: nothing is recorded.</div>
                </div>
              </div>
              <button className="btn" type="submit" disabled={sending || recording}>{sending ? "Applying…" : "Apply"}</button>
              {error ? <p className="error">{error}</p> : null}
            </form>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              <div className="callout"><b>Applied.</b> The recruiter sees your role, license state, years and shift{voice ? ", plus your voice intro" : ""}.</div>
              <h3 style={{ fontSize: 15 }}>Jobs you may also like</h3>
              {suggestions.length === 0 ? <p className="empty">No other open jobs right now.</p> : suggestions.map((s) => (
                <div className="sugg" key={s.id}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.title}</div>
                    <div className="meta">{s.location} · {roleById[s.role_id]?.name}{s.role_id === role ? " · matches your role" : ""}</div>
                  </div>
                  <button className="btn small" disabled={sending} onClick={() => apply(s)}>Apply</button>
                </div>
              ))}
              <button className="btn small ghost" onClick={() => { setStep("apply"); setVoice(false); setSeconds(0); }}>Start another application</button>
              {error ? <p className="error">{error}</p> : null}
            </div>
          )}
        </div>

        <div className="stack">
          <div className="panel stack">
            <h2>Try it as a clinician</h2>
            <label className="field">Job to apply to
              <select id="ca-job" value={job.id} onChange={(e) => { setJobId(e.target.value); setStep("apply"); }}>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </label>
            <label className="field">Channel the clinician came from (demo)
              <select id="ca-source" value={source} onChange={(e) => setSource(e.target.value)}>
                {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <p className="sub" style={{ margin: 0, fontSize: 13 }}>Each application is counted for that job and channel, so you can watch it appear in the activity feed and the job&apos;s numbers on the first tab.</p>
          </div>
          <div className="panel stack">
            <h2>Why this brings more applicants</h2>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)", display: "grid", gap: 8 }}>
              <li><b style={{ color: "var(--fg)" }}>Four questions, no account.</b> Short applications lose fewer people, especially on phones.</li>
              <li><b style={{ color: "var(--fg)" }}>Voice instead of a resume.</b> Easier on a break between shifts, and it gives recruiters a first impression.</li>
              <li><b style={{ color: "var(--fg)" }}>Job suggestions.</b> One visit can turn into several applications.</li>
              <li><b style={{ color: "var(--fg)" }}>Private by design.</b> The prototype stores only role, state, years, shift and whether a voice intro was added.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
