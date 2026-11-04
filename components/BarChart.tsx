import { niceTicks } from "@/lib/format";

type Props = {
  labels: string[];
  values: number[];
  format: (v: number) => string;
  tooltip: (i: number) => string;
};

// Single-series bar chart drawn to scale in SVG; hover a column for its value.
export default function BarChart({ labels, values, format, tooltip }: Props) {
  const W = 560, H = 220, L = 46, B = 26, T = 8, R = 4;
  const ticks = niceTicks(Math.max(...values, 1));
  const top = ticks[ticks.length - 1];
  const pw = W - L - R, ph = H - T - B;
  const bw = pw / Math.max(values.length, 1);
  const w = Math.max(3, Math.min(22, bw * 0.6));
  const y = (v: number) => T + ph - (v / top) * ph;
  const every = values.length > 12 ? 3 : values.length > 6 ? 2 : 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bar chart">
      <g className="grid">
        {ticks.map((t) => <line key={t} x1={L} x2={W - R} y1={y(t)} y2={y(t)} />)}
      </g>
      <g className="axis">
        {ticks.map((t) => <text key={t} x={L - 8} y={y(t) + 4} textAnchor="end">{format(t)}</text>)}
        {labels.map((lab, i) =>
          i % every === 0 || i === labels.length - 1 ? (
            <text key={lab + i} x={L + bw * i + bw / 2} y={H - 6} textAnchor="middle">{lab}</text>
          ) : null
        )}
      </g>
      {values.map((v, i) => {
        const x = L + bw * i + (bw - w) / 2, yy = y(v), h = Math.max(0, T + ph - yy), r = Math.min(4, h, w / 2);
        const d = h <= 0 ? "" : `M${x},${T + ph} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + w - r} Q${x + w},${yy} ${x + w},${yy + r} V${T + ph} Z`;
        return (
          <g key={i} data-tip={tooltip(i)}>
            <rect x={L + bw * i} y={T} width={bw} height={ph} fill="transparent" />
            <path className="mark-bar" d={d} />
          </g>
        );
      })}
    </svg>
  );
}
