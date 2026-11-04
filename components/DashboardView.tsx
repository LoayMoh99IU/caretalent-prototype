"use client";

import { useMemo, useState } from "react";
import BarChart from "./BarChart";
import Kpis from "./Kpis";
import { fmtK, fmtN, fmtUSD, monthLabel, pct, signal } from "@/lib/format";
import type { Board, MonthlyRow, Role } from "@/lib/types";

export type Totals = {
  spend: number; clicks: number; applicants: number; qualified: number; interviews: number;
  hires: number; retained_90: number; retained_365: number; matureHires: number;
};

export function sumRows(rows: MonthlyRow[]): Totals {
  const s: Totals = { spend: 0, clicks: 0, applicants: 0, qualified: 0, interviews: 0, hires: 0, retained_90: 0, retained_365: 0, matureHires: 0 };
  for (const r of rows) {
    s.spend += r.spend; s.clicks += r.clicks; s.applicants += r.applicants; s.qualified += r.qualified;
    s.interviews += r.interviews; s.hires += r.hires; s.retained_90 += r.retained_90;
    if (r.retained_365 != null) { s.retained_365 += r.retained_365; s.matureHires += r.hires; }
  }
  return s;
}

type Props = { boards: Board[]; roles: Role[]; monthly: MonthlyRow[] };

export default function DashboardView({ boards, roles, monthly }: Props) {
  const [board, setBoard] = useState("all");
  const [role, setRole] = useState("all");
  const [range, setRange] = useState(12);

  const months = useMemo(() => Array.from(new Set(monthly.map((m) => m.month))).sort(), [monthly]);
  const shown = months.slice(Math.max(0, months.length - range));
  const rows = monthly.filter((r) => shown.includes(r.month) && (board === "all" || r.board_id === board) && (role === "all" || r.role_id === role));
  const s = sumRows(rows);
  const per = shown.map((m) => sumRows(rows.filter((r) => r.month === m)));
  const avgCph = s.spend / Math.max(s.hires, 0.01);

  const byBoard = boards.filter((b) => board === "all" || b.id === board)
    .map((b) => ({ b, s: sumRows(rows.filter((r) => r.board_id === b.id)) }))
    .sort((a, z) => a.s.spend / Math.max(a.s.hires, 0.01) - z.s.spend / Math.max(z.s.hires, 0.01));
  const byRole = roles.filter((r) => role === "all" || r.id === role).map((r) => ({ r, s: sumRows(rows.filter((x) => x.role_id === r.id)) }));

  if (!months.length) return <p className="skeleton">Loading hiring history…</p>;

  return (
    <section>
      <div className="view-head">
        <div className="rule" />
        <h1>Hiring dashboard</h1>
        <p className="sub">What you spent, who applied, who you hired, and who is still with you a year later.</p>
      </div>
      <div className="stack">
        <div className="filters panel" style={{ padding: "14px 18px" }}>
          <label className="field">Job board
            <select id="f-board" value={board} onChange={(e) => setBoard(e.target.value)}>
              <option value="all">All boards</option>
              {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="field">Role
            <select id="f-role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="all">All roles</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="field">Period
            <select id="f-range" value={range} onChange={(e) => setRange(Number(e.target.value))}>
              <option value={3}>Last 3 months</option>
              <option value={6}>Last 6 months</option>
              <option value={12}>Last 12 months</option>
              <option value={18}>Last 18 months</option>
            </select>
          </label>
        </div>
        <Kpis items={[
          { label: "Ad spend", value: fmtUSD(s.spend), note: `${monthLabel(shown[0])} – ${monthLabel(shown[shown.length - 1])}` },
          { label: "Applicants", value: fmtN(s.applicants), note: `${fmtN(s.clicks)} clicks` },
          { label: "Qualified", value: fmtN(s.qualified), note: `${pct(s.qualified / s.applicants)} of applicants` },
          { label: "Hires", value: fmtN(s.hires), note: `${fmtN(s.interviews)} interviews` },
          { label: "Cost per hire", value: fmtUSD(avgCph), note: "ad spend only" },
          { label: "365-day retention", value: s.matureHires ? pct(s.retained_365 / s.matureHires) : "Tracking", note: s.matureHires ? "hires from May–Oct 2025" : "first cohort completes a year soon" },
        ]} />
        <div className="grid-2">
          <div className="panel chart">
            <div className="panel-head"><h2>Ad spend by month</h2><span className="eyebrow">USD</span></div>
            <BarChart labels={shown.map((m) => monthLabel(m))} values={per.map((p) => p.spend)} format={fmtK}
              tooltip={(i) => `${monthLabel(shown[i], true)}<br>Spend <b>${fmtUSD(per[i].spend)}</b>`} />
          </div>
          <div className="panel chart">
            <div className="panel-head"><h2>Hires by month</h2><span className="eyebrow">clinicians</span></div>
            <BarChart labels={shown.map((m) => monthLabel(m))} values={per.map((p) => p.hires)} format={(v) => fmtN(v)}
              tooltip={(i) => `${monthLabel(shown[i], true)}<br>Hires <b>${fmtN(per[i].hires)}</b> · ${fmtUSD(per[i].spend / Math.max(per[i].hires, 0.01))} per hire`} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Results by job board</h2><span className="eyebrow">signal compares cost per hire with the average</span></div>
          <div className="table-wrap"><table>
            <thead><tr><th>Board</th><th>Spend</th><th>Clicks</th><th>Applicants</th><th>Qualified</th><th>Hires</th><th>Cost / hire</th><th>365-day retention</th><th style={{ textAlign: "left" }}>Signal</th></tr></thead>
            <tbody>{byBoard.map(({ b, s: x }) => {
              const cph = x.spend / Math.max(x.hires, 0.01), sg = signal(cph / avgCph);
              return (
                <tr key={b.id}>
                  <td><span className="swatch" style={{ background: b.color }} />{b.name}</td>
                  <td>{fmtUSD(x.spend)}</td><td>{fmtN(x.clicks)}</td><td>{fmtN(x.applicants)}</td><td>{fmtN(x.qualified)}</td><td>{fmtN(x.hires)}</td>
                  <td>{fmtUSD(cph)}</td><td>{x.matureHires ? pct(x.retained_365 / x.matureHires) : "Tracking"}</td>
                  <td style={{ textAlign: "left" }}>{board === "all" ? <span className={`chip ${sg.tone}`}>{sg.label}</span> : null}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Results by role</h2></div>
          <div className="table-wrap"><table>
            <thead><tr><th>Role</th><th>Spend</th><th>Applicants</th><th>Qualified</th><th>Hires</th><th>Cost / hire</th><th>365-day retention</th></tr></thead>
            <tbody>{byRole.map(({ r, s: x }) => (
              <tr key={r.id}>
                <td>{r.name}</td><td>{fmtUSD(x.spend)}</td><td>{fmtN(x.applicants)}</td><td>{fmtN(x.qualified)}</td><td>{fmtN(x.hires)}</td>
                <td>{fmtUSD(x.spend / Math.max(x.hires, 0.01))}</td><td>{x.matureHires ? pct(x.retained_365 / x.matureHires) : "Tracking"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      </div>
    </section>
  );
}
