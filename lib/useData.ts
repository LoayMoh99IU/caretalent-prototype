"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { AbVariant, Activity, Board, Job, MonthlyRow, PostingTotal, Role } from "./types";

const num = <T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T => {
  const out = { ...row };
  keys.forEach((k) => {
    const v = out[k];
    if (v !== null && v !== undefined) (out as Record<string, unknown>)[k as string] = Number(v);
  });
  return out;
};

export type LiveState = {
  boards: Board[];
  roles: Role[];
  jobs: Job[];
  totals: PostingTotal[];
  activity: Activity[];
  monthly: MonthlyRow[];
  ab: AbVariant[];
  loading: boolean;
  error: string | null;
  live: boolean;
};

export function useCareTalentData() {
  const [state, setState] = useState<LiveState>({
    boards: [], roles: [], jobs: [], totals: [], activity: [], monthly: [], ab: [],
    loading: true, error: null, live: false,
  });
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadJobs = useCallback(async () => {
    const [jobs, totals, activity] = await Promise.all([
      supabase.from("jobs").select("*").order("created_at", { ascending: false }),
      supabase.from("posting_totals").select("*"),
      supabase.from("activity").select("*").order("id", { ascending: false }).limit(60),
    ]);
    const err = jobs.error || totals.error || activity.error;
    if (err) throw err;
    setState((s) => ({
      ...s,
      jobs: (jobs.data as Job[]).map((j) => num(j, ["monthly_budget", "days_live", "baseline_weekly"])),
      totals: (totals.data as PostingTotal[]).map((t) =>
        num(t, ["budget_share", "spend", "clicks", "applicants", "qualified", "hires"])
      ),
      activity: activity.data as Activity[],
    }));
  }, []);

  // first load: reference data, history, then the live jobs
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [boards, roles, monthly, ab] = await Promise.all([
          supabase.from("job_boards").select("*").order("sort"),
          supabase.from("roles").select("*").order("sort"),
          supabase.from("hiring_monthly").select("*").order("month").limit(2000),
          supabase.from("ab_tests").select("*").order("variant"),
        ]);
        const err = boards.error || roles.error || monthly.error || ab.error;
        if (err) throw err;
        if (cancelled) return;
        setState((s) => ({
          ...s,
          boards: (boards.data as Board[]).map((b) =>
            num(b, ["cpc", "apply_rate", "qual_rate", "hire_rate", "retention_365", "default_share"])
          ),
          roles: (roles.data as Role[]).map((r) => num(r, ["hire_factor", "spend_share"])),
          monthly: (monthly.data as MonthlyRow[]).map((m) =>
            num(m, ["spend", "clicks", "applicants", "qualified", "interviews", "hires", "retained_90", "retained_365"])
          ),
          ab: ab.data as AbVariant[],
        }));
        await loadJobs();
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      } catch (e) {
        if (!cancelled)
          setState((s) => ({ ...s, loading: false, error: "Couldn't reach the database. Check your connection and reload." }));
      }
    })();
    return () => { cancelled = true; };
  }, [loadJobs]);

  // realtime: any change to jobs or new activity refreshes the job cards and feed
  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => { loadJobs().catch(() => {}); }, 250);
    };
    const channel = supabase
      .channel("caretalent-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity" }, scheduleRefresh)
      .subscribe((status) => setState((s) => ({ ...s, live: status === "SUBSCRIBED" })));
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [loadJobs]);

  return { ...state, refresh: loadJobs };
}
