export default function StatusBadge({ status, overdue, paused }) {
  if (overdue) {
    return <span className="badge overdue">Overdue</span>;
  }
  if (paused) {
    return <span className="badge paused">Paused</span>;
  }
  const s = String(status || '').toLowerCase();
  return <span className={`badge ${s}`}>{s}</span>;
}
