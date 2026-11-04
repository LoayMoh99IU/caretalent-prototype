export type Board = {
  id: string;
  name: string;
  cpc: number;
  apply_rate: number;
  qual_rate: number;
  hire_rate: number;
  retention_365: number;
  default_share: number;
  color: string;
  sort: number;
};

export type Role = { id: string; name: string; hire_factor: number; spend_share: number; sort: number };

export type Job = {
  id: string;
  title: string;
  role_id: string;
  location: string;
  monthly_budget: number;
  days_live: number;
  rebalanced: boolean;
  is_sample: boolean;
  created_at: string;
};

export type PostingTotal = {
  job_id: string;
  board_id: string;
  budget_share: number;
  spend: number;
  clicks: number;
  applicants: number;
  qualified: number;
  hires: number;
};

export type Activity = {
  id: number;
  job_id: string;
  board_id: string | null;
  day: number;
  kind: "posted" | "applicants" | "hire" | "rebalanced";
  message: string;
  created_at: string;
};

export type MonthlyRow = {
  month: string;
  board_id: string;
  role_id: string;
  spend: number;
  clicks: number;
  applicants: number;
  qualified: number;
  interviews: number;
  hires: number;
  retained_90: number;
  retained_365: number | null;
};

export type AbVariant = {
  id: string;
  name: string;
  variant: string;
  headline: string;
  body: string;
  views: number;
  applies: number;
  qualified: number;
};
