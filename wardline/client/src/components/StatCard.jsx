export default function StatCard({ label, value, danger, accent }) {
  return (
    <div className={"card stat-card" + (accent ? " accent-" + accent : "")}>
      <div className="label">{label}</div>
      <div className={"value" + (danger ? " danger" : "")}>{value}</div>
    </div>
  );
}
