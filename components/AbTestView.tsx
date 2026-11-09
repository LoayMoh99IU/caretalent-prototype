"use client";

import { useEffect, useState } from "react";
import Kpis from "./Kpis";
import { fmtN, normCdf, pct } from "@/lib/format";
import type { AbVariant } from "@/lib/types";

// Two-proportion z-test on apply rate (applies / views).
export default function AbTestView({ ab }: { ab: AbVariant[] }) {
  const [vs, setVs] = useState<AbVariant[]>(ab);
  useEffect(() => { if (ab.length) setVs(ab); }, [ab]);
  if (vs.length < 2) return <p className="skeleton">Loading the test…</p>;

  const set = (i: number, k: "views" | "applies", v: number) =>
    setVs((cur) => cur.map((x, j) => (j === i ? { ...x, [k]: Math.max(0, v || 0) } : x)));

  const [a, b] = vs;
  const p1 = a.views ? a.applies / a.views : 0, p2 = b.views ? b.applies / b.views : 0;
  const pool = (a.applies + b.applies) / Math.max(a.views + b.views, 1);
  const se = Math.sqrt(pool * (1 - pool) * (1 / Math.max(a.views, 1) + 1 / Math.max(b.views, 1)));
  const z = se ? (p2 - p1) / se : 0;
  const p = 2 * (1 - normCdf(Math.abs(z)));
  const winner = p2 >= p1 ? b : a, loser = winner === b ? a : b;
  const lift = Math.max(p1, p2) / Math.max(Math.min(p1, p2), 1e-9) - 1;
  const need = Math.abs(p2 - p1) > 1e-6 ? Math.ceil(Math.pow(1.96 + 0.84, 2) * (p1 * (1 - p1) + p2 * (1 - p2)) / Math.pow(p2 - p1, 2)) : Infinity;
  const more = Number.isFinite(need) ? Math.max(0, need - Math.min(a.views, b.views)) : null;

  return (
    <section>
      <div className="view-head">
        <div className="rule" />
        <span className="eyebrow">Priority 1 · better ads bring more applicants</span>
        <h1>Which version of the post works better?</h1>
        <p className="sub">Two versions of the same ICU RN job ran side by side on the same boards. Edit the counts to see how the answer changes.</p>
      </div>
      <div className="stack">
        <div className="grid-2">
          {vs.map((v, i) => {
            const q = Math.min(v.qualified, v.applies);
            return (
              <div className="panel variant" key={v.id}>
                <div className="panel-head" style={{ margin: 0 }}><h2>Version {v.variant}</h2><span className="eyebrow">same boards, same budget</span></div>
                <div className="posting"><div className="t">{v.headline}</div><p>{v.body}</p></div>
                <div className="vstats">
                  <label className="field">People who saw it<input type="number" min={1} id={`ab-views-${i}`} value={v.views} onChange={(e) => set(i, "views", Number(e.target.value))} /></label>
                  <label className="field">Applied<input type="number" min={0} id={`ab-applies-${i}`} value={v.applies} onChange={(e) => set(i, "applies", Number(e.target.value))} /></label>
                </div>
                <Kpis items={[
                  { label: "Apply rate", value: pct(v.views ? v.applies / v.views : 0, 1) },
                  { label: "Qualified applicants", value: fmtN(q), note: `${pct(v.applies ? q / v.applies : 0)} of applicants` },
                ]} />
              </div>
            );
          })}
        </div>
        {p < 0.05 ? (
          <div className="verdict win">
            <span className="eyebrow">Result</span>
            <div className="big">Version {winner.variant} wins: {pct(lift)} more applicants per view</div>
            <div>{pct(1 - p, 1)} confidence this is a real difference, not chance. Recommendation: send all traffic to version {winner.variant} and retire version {loser.variant}.</div>
          </div>
        ) : (
          <div className="verdict wait">
            <span className="eyebrow">Result</span>
            <div className="big">Too early to call</div>
            <div>Version {winner.variant} is ahead by {pct(lift)}, at {pct(1 - p)} confidence. {more != null ? `About ${fmtN(more)} more views per version would settle it.` : "The two versions are performing the same."} Keep both running.</div>
          </div>
        )}
      </div>
    </section>
  );
}
