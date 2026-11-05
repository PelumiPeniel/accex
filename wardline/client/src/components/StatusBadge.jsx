const MAP = {
  Active: "badge-active",
  Overdue: "badge-overdue",
  Completed: "badge-completed",
  Cancelled: "badge-cancelled"
};

export default function StatusBadge({ status }) {
  return (
    <span className={`badge ${MAP[status] || "badge-completed"}`}>
      <span className="badge-dot" />
      {status}
    </span>
  );
}
