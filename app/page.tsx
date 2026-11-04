"use client";

import { useEffect, useState } from "react";
import AdsView from "@/components/AdsView";
import DashboardView from "@/components/DashboardView";
import AbTestView from "@/components/AbTestView";
import RoiView from "@/components/RoiView";
import Tooltip from "@/components/Tooltip";
import { useCareTalentData } from "@/lib/useData";

const VIEWS = [
  { id: "ads", label: "Smart job ads" },
  { id: "dashboard", label: "Hiring dashboard" },
  { id: "abtest", label: "A/B test" },
  { id: "roi", label: "Ad spend ROI" },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

export default function Home() {
  const data = useCareTalentData();
  const [view, setView] = useState<ViewId>("ads");

  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      setView((VIEWS.find((v) => v.id === h)?.id ?? "ads") as ViewId);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="top-row">
            <div className="brand">
              <span className="mark" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
                  <circle cx="8" cy="4.6" r="1.9" fill="#fff" stroke="none" />
                  <path d="M3.5 8.5c1.6 1.2 3 1.6 4.5 1.6s2.9-.4 4.5-1.6M8 10.2v3.6" />
                </svg>
              </span>
              <span>CareTalent <span className="ai">AI</span></span>
            </div>
            <div className="employer">
              For employers · <b>Riverside Health System</b> <span className="pill">Sample data</span>{" "}
              <span className={`pill ${data.live ? "live" : ""}`}>{data.live ? "Live" : data.loading ? "Connecting…" : "Saved"}</span>
            </div>
          </div>
          <nav className="tabs" role="tablist" aria-label="Sections">
            {VIEWS.map((v) => (
              <button key={v.id} className="tab" role="tab" aria-selected={view === v.id}
                onClick={() => { window.location.hash = v.id; }}>{v.label}</button>
            ))}
          </nav>
        </div>
      </header>

      <main className="wrap">
        {data.error ? <div className="banner">{data.error}</div> : null}
        {data.loading ? <p className="skeleton">Loading…</p> : (
          <>
            {view === "ads" && <AdsView boards={data.boards} roles={data.roles} jobs={data.jobs} totals={data.totals} activity={data.activity} refresh={data.refresh} />}
            {view === "dashboard" && <DashboardView boards={data.boards} roles={data.roles} monthly={data.monthly} />}
            {view === "abtest" && <AbTestView ab={data.ab} />}
            {view === "roi" && <RoiView boards={data.boards} monthly={data.monthly} />}
          </>
        )}
      </main>

      <footer className="wrap">Prototype for CareTalent AI with sample data, built on Next.js and Supabase. Prepared by Loay Mahmoud.</footer>
      <Tooltip />
    </>
  );
}
