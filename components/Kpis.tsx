export type Kpi = { label: string; value: string; note?: string };

export default function Kpis({ items }: { items: Kpi[] }) {
  return (
    <div className="kpis">
      {items.map((k) => (
        <div className="kpi" key={k.label}>
          <div className="label">{k.label}</div>
          <div className="value">{k.value}</div>
          {k.note ? <div className="note">{k.note}</div> : null}
        </div>
      ))}
    </div>
  );
}
