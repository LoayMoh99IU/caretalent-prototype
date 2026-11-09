"use client";

import { useState } from "react";
import Kpis from "./Kpis";
import { sumRows } from "./DashboardView";
import { fmtN, fmtUSD, pct } from "@/lib/format";
import type { Board, MonthlyRow } from "@/lib/types";

// Finance view: only cohorts whose 365-day result is known.
export default function RoiView({ boards, monthly }: { boards: Board[]; monthly: MonthlyRow[] }) {
  const [agency, setAgency] = useState(25000);
  const rows = monthly.filter((r) => r.retained_365 != null);
  if (!rows.length) return <p className="skeleton">Loading cohorts…</p>;
  const s = sumRows(rows);
  const cprh = s.spend / Math.max(s.retained_365, 0.01);

  const steps: [string, string, number][] = [
    ["Clicks", "people who opened the ad", s.clicks],
    ["Applicants", "submitted an application", s.applicants],
    ["Qualified", "met license and experience bar", s.qualified],
    ["Interviewed", "", s.interviews],
    ["Hired", "", s.hires],
    ["Stayed 90 days", "", s.retained_90],
    ["Stayed 365 days", "the number finance cares about", s.retained_365],
  ];
  const byBoard = boards.map((b) => {
    const x = sumRows(rows.filter((r) => r.board_id === b.id));
    return { b, v: x.spend / Math.max(x.retained_365, 0.01) };
  }).sort((a, z) => a.v - z.v);
  const max = Math.max(...byBoard.map((x) => x.v));
  const savedEach = agency - cprh;

  return (
    <section>
      <div className="view-head">
        <div className="rule" />
        <span className="eyebrow">Phase 2 · after the pilot has hire data</span>
        <h1>What each job-ad dollar bought</h1>
        <p className="sub">For finance: every stage from the first click to a hire who stayed a full year. Uses hire cohorts from May to October 2025, the newest ones with complete 365-day results.</p>
      </div>
      <div className="stack">
        <Kpis items={[
          { label: "Ad spend", value: fmtUSD(s.spend), note: "May–Oct 2025" },
          { label: "Hires", value: fmtN(s.hires), note: "from job ads" },
          { label: "Still employed at 365 days", value: fmtN(s.retained_365), note: `${pct(s.retained_365 / s.hires)} of hires` },
          { label: "Cost per retained hire", value: fmtUSD(cprh), note: "ad spend ÷ retained hires" },
        ]} />
        <div className="panel">
          <div className="panel-head"><h2>From first click to a hire who stayed</h2><span className="eyebrow">all boards, all roles</span></div>
          <div className="funnel">
            <div className="fstep fhead"><div>Stage</div><div className="barcell">Share of previous stage</div><div>Count</div><div>Cost each</div></div>
            {steps.map(([name, sm, v], i) => {
              const conv = i ? v / steps[i - 1][2] : 1;
              return (
                <div className="fstep" key={name}>
                  <div className="name">{name}{sm ? <small>{sm}</small> : null}</div>
                  <div className="barcell" data-tip={i ? `${pct(conv, 1)} of ${steps[i - 1][0].toLowerCase()}` : "Starting point"}>
                    <div className="hbar" style={{ gridTemplateColumns: "minmax(0,1fr) 52px", gap: 8 }}>
                      <div className="track"><div className="fill" style={{ width: `${conv * 100}%` }} /></div>
                      <div className="v" style={{ fontSize: 12, color: "var(--muted)" }}>{i ? pct(conv, 1) : "100%"}</div>
                    </div>
                  </div>
                  <div className="count">{fmtN(v)}</div>
                  <div className="cost">{fmtUSD(s.spend / Math.max(v, 0.01))}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="grid-2">
          <div className="panel">
            <div className="panel-head"><h2>Cost per hire retained 365 days</h2><span className="eyebrow">lower is better</span></div>
            <div className="hbars">
              {byBoard.map(({ b, v }) => (
                <div className="hbar" key={b.id} data-tip={`${b.name}: <b>${fmtUSD(v)}</b> per hire still employed after a year`}>
                  <span>{b.name}</span>
                  <div className="track"><div className="fill" style={{ width: `${((v / max) * 100).toFixed(1)}%` }} /></div>
                  <span className="v">{fmtUSD(v)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel stack">
            <h2>Compared with agency hiring</h2>
            <label className="field">Your average agency cost per placed clinician (USD)
              <input type="number" id="r-agency" min={0} step={1000} value={agency} onChange={(e) => setAgency(Math.max(0, Number(e.target.value) || 0))} />
            </label>
            <p className="sub" style={{ margin: 0, fontSize: 13 }}>This is an assumption. Change it to match your agency contracts.</p>
            <div className="callout">
              {savedEach > 0
                ? <>Each retained hire from job ads cost <b>{fmtUSD(cprh)}</b> versus <b>{fmtUSD(agency)}</b> through an agency. Across {fmtN(s.retained_365)} retained hires, that is about <b>{fmtUSD(savedEach * s.retained_365)}</b> saved in six months.</>
                : <>At this agency cost, job ads cost <b>{fmtUSD(-savedEach)}</b> more per retained hire. Shift budget toward the boards at the top of the list on the left.</>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
