const TONES = {
  ok: "text-ok bg-ok-soft",
  warn: "text-warn bg-warn-soft",
  bad: "text-bad bg-bad-soft",
  info: "text-info bg-info-soft",
  neutral: "text-muted bg-canvas",
};

const MAP = {
  auto_resolved: ["ok", "Auto-resolved"],
  escalated: ["warn", "Escalated"],
  failed: ["bad", "Failed"],
  received: ["neutral", "Received"],
  processing: ["info", "Processing"],
  open: ["warn", "Open"],
  in_review: ["info", "In review"],
  resolved: ["ok", "Resolved"],
  success: ["ok", "Success"],
  rolled_back: ["warn", "Rolled back"],
  pending: ["info", "Pending"],
  low: ["neutral", "Low"],
  medium: ["warn", "Medium"],
  high: ["bad", "High"],
  critical: ["bad", "Critical"],
  active: ["ok", "Active"],
  inactive: ["neutral", "Inactive"],
};

export default function StatusChip({ value, label, tone, className = "" }) {
  if (!value && !label) return null;
  const [t, l] = MAP[value] || ["neutral", String(value || "").replace(/_/g, " ")];
  const resolvedTone = tone || t;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-medium ${TONES[resolvedTone]} ${className}`}
    >
      <span className={`size-1.5 rounded-full bg-current ${value === "processing" ? "pulse-dot" : ""}`} />
      {label || l}
    </span>
  );
}
