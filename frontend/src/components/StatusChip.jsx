const STYLES = {
  auto_resolved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  escalated: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  failed: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  received: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  processing: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  open: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  in_review: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  resolved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  low: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  medium: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  high: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  critical: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
};

const LABELS = {
  auto_resolved: "Auto-resolved",
  escalated: "Escalated",
  failed: "Failed",
  received: "Received",
  processing: "Processing",
};

export default function StatusChip({ value, className = "" }) {
  if (!value) return null;
  const style = STYLES[value] || "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
  const label = LABELS[value] || value.replace(/_/g, " ");
  return <span className={`chip capitalize ${style} ${className}`}>{label}</span>;
}
