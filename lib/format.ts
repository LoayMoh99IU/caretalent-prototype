export const fmtUSD = (v: number) => "$" + Math.round(v).toLocaleString("en-US");
export const fmtK = (v: number) =>
  v >= 1000 ? "$" + (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "K" : "$" + Math.round(v);
export const fmtN = (v: number) => Math.round(v).toLocaleString("en-US");
export const pct = (v: number, d = 0) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "–");

export function niceTicks(max: number, n = 4): number[] {
  const raw = Math.max(max, 1) / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(Math.max(max, 1) / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return ticks;
}

// standard normal CDF (Abramowitz–Stegun approximation)
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export const monthLabel = (iso: string, long = false) => {
  const d = new Date(iso + "T00:00:00");
  return long
    ? d.toLocaleString("en-US", { month: "long", year: "numeric" })
    : d.toLocaleString("en-US", { month: "short" }) + " " + String(d.getFullYear()).slice(2);
};

// "Scale up" / "Hold" / "Cut back" signal from a cost ratio vs. the average
export function signal(ratio: number): { label: string; tone: "good" | "warn" | "bad" } {
  if (ratio <= 0.75) return { label: "Scale up", tone: "good" };
  if (ratio >= 1.5) return { label: "Cut back", tone: "bad" };
  return { label: "Hold", tone: "warn" };
}
