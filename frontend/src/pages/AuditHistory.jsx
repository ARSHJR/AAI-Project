import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, RefreshCw, ScrollText, Search } from "lucide-react";
import { listAudit } from "../lib/api";
import { actionLabel, fmtFull, shortId, titleCase } from "../lib/format";
import { Button, Card, EmptyState, ErrorState, Mono, PageHeader, Skeleton, fieldCls } from "../components/ui";

const EVENT_LABEL = {
  language: "Language detected",
  intent: "Intent classified",
  order_lookup: "Order retrieved",
  policy_match: "Policy matched",
  repeat_contact: "Repeat-contact check",
  decision: "Decision made",
  action_execution: "Action executed",
  escalation: "Escalation created",
  response_drafting: "Response drafted",
  fatal_error: "Fatal error",
};

// One-line outcome derived from the recorded event details.
function outcomeOf(r) {
  const d = r.details || {};
  switch (r.event_type) {
    case "language":
      return { text: `${d.detected_language?.toUpperCase() || "—"} · ${d.script || ""}` };
    case "intent":
      return { text: `${titleCase(d.intent)}${d.intent_confidence != null ? ` · ${Math.round(d.intent_confidence * 100)}%` : ""}` };
    case "order_lookup":
      return d.order_not_found
        ? { text: "Order not found", tone: "warn" }
        : { text: d.order ? `${d.order.order_id} · ${titleCase(d.order.status)}` : "—" };
    case "policy_match":
      return d.policy
        ? { text: `${d.policy.code} · ${d.eligible ? "eligible" : "not eligible"}`, tone: d.eligible ? "ok" : "warn" }
        : { text: "No policy applies" };
    case "repeat_contact":
      return { text: `${d.repeat_contact_count} unresolved`, tone: d.repeat_contact_escalate ? "warn" : undefined };
    case "decision":
      return { text: actionLabel(d.decision), tone: d.decision === "escalation" ? "warn" : undefined };
    case "action_execution":
      return d.status === "success"
        ? { text: "Executed", tone: "ok" }
        : { text: "Failed", tone: "bad" };
    case "escalation":
      return { text: `${titleCase(d.escalation_urgency)} urgency`, tone: "warn" };
    case "response_drafting":
      return { text: `Reply in ${d.language || "—"}` };
    case "fatal_error":
      return { text: "Error", tone: "bad" };
    default:
      return { text: "—" };
  }
}

const TONE_CLS = { ok: "text-ok", warn: "text-warn", bad: "text-bad" };

export default function AuditHistory() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [event, setEvent] = useState("");

  function load() {
    setLoading(true);
    setError("");
    listAudit({ limit: 300 })
      .then(setRows)
      .catch(() => setError("Could not load the audit log."))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const eventTypes = useMemo(() => [...new Set(rows.map((r) => r.event_type))].sort(), [rows]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!event || r.event_type === event) &&
        (!q || [r.ticket_id, r.actor, r.event_type, JSON.stringify(r.details)].some((v) => v && String(v).toLowerCase().includes(q))),
    );
  }, [rows, query, event]);

  function exportCsv() {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = "created_at,ticket_id,actor,event_type,details\n";
    const body = visible
      .map((r) => [r.created_at, r.ticket_id, r.actor, r.event_type, JSON.stringify(r.details)].map(esc).join(","))
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit_trail_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Audit History"
        description="Append-only record of every decision step: what ran, who ran it, and what it produced."
        actions={
          <>
            <Button icon={RefreshCw} onClick={load}>
              Refresh
            </Button>
            <Button variant="dark" icon={Download} onClick={exportCsv} disabled={!visible.length}>
              Export CSV
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1 md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticket, actor, event or details"
            className={`${fieldCls} pl-9`}
          />
        </div>
        <select aria-label="Event" value={event} onChange={(e) => setEvent(e.target.value)} className={`${fieldCls} !w-52`}>
          <option value="">All events</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>
              {EVENT_LABEL[t] || titleCase(t)}
            </option>
          ))}
        </select>
        <div className="tnum ml-auto text-[13px] text-muted">{visible.length} events</div>
      </div>

      {error && <ErrorState onRetry={load}>{error}</ErrorState>}

      {!error && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[820px] text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-line bg-sunken text-[12px] font-semibold text-muted">
                  <th className="px-5 py-2.5">Timestamp</th>
                  <th className="px-3 py-2.5">Ticket</th>
                  <th className="px-3 py-2.5">Event</th>
                  <th className="px-3 py-2.5">Component</th>
                  <th className="px-3 py-2.5">Outcome</th>
                  <th className="px-5 py-2.5">Reference</th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-line">
                      <td colSpan={6} className="px-5 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))}
                {!loading &&
                  visible.map((r) => {
                    const o = outcomeOf(r);
                    const ref = r.details?.reference_id || r.details?.policy?.code;
                    return (
                      <tr key={r.id} className="border-b border-line last:border-0 hover:bg-sunken">
                        <td className="tnum whitespace-nowrap px-5 py-2.5 text-muted">{fmtFull(r.created_at)}</td>
                        <td className="px-3 py-2.5">
                          {r.ticket_id ? (
                            <Link to={`/tickets/${r.ticket_id}`} className="font-mono text-[12.5px] font-medium text-accent hover:underline">
                              #{shortId(r.ticket_id)}
                            </Link>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-ink">{EVENT_LABEL[r.event_type] || titleCase(r.event_type)}</td>
                        <td className="px-3 py-2.5">
                          <Mono className="rounded bg-canvas px-1.5 py-0.5 text-muted">{r.actor}</Mono>
                        </td>
                        <td className={`px-3 py-2.5 ${TONE_CLS[o.tone] || "text-body"}`}>{o.text}</td>
                        <td className="px-5 py-2.5">{ref ? <Mono className="text-muted">{ref}</Mono> : <span className="text-faint">—</span>}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {!loading && visible.length === 0 && (
            <EmptyState icon={ScrollText} title={rows.length ? "No events match" : "No audit events yet"}>
              {rows.length ? "Clear the search or event filter to see more." : "Every pipeline step is logged here as tickets are processed."}
            </EmptyState>
          )}
        </Card>
      )}
    </>
  );
}
