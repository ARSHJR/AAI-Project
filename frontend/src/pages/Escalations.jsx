import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ClipboardCheck, RefreshCw, ScanSearch, ShieldAlert } from "lucide-react";
import { listEscalations } from "../lib/api";
import {
  channelName,
  inr,
  langName,
  pct,
  shortId,
  timeAgo,
  titleCase,
  fmtDateTime,
} from "../lib/format";
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from "../components/ui";
import StatusChip from "../components/StatusChip";

const TABS = [
  { value: "open", label: "Open" },
  { value: "in_review", label: "In review" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

// Maps the escalation reason text the pipeline recorded to what a reviewer should do next.
const GUIDANCE = [
  [/order could not be found|customer_or_order_not_found/i, "Confirm the order number with the customer and look the order up manually."],
  [/customer could not be identified/i, "Verify the customer's identity and which account the request belongs to."],
  [/repeat unresolved|repeat_unresolved_contact/i, "Review earlier contacts on this order, take ownership and give the customer a firm resolution."],
  [/exceeds .*cap|needs human review|high_value/i, "Review the claim and approve or decline the financial action; the order value is above the auto-approval cap."],
  [/low_intent_confidence/i, "Read the message yourself and confirm what the customer is asking for."],
  [/multi_intent_conflict/i, "The customer asked for more than one thing; decide which request to handle first."],
  [/execution failed/i, "Check the downstream action system, then retry the action or process it manually."],
  [/unsupported_or_ambiguous|cancelled|not past its eta/i, "Check the order history and the customer's claim against policy before replying."],
];

function guidanceFor(texts) {
  const joined = texts.filter(Boolean).join(" | ");
  const steps = GUIDANCE.filter(([re]) => re.test(joined)).map(([, s]) => s);
  return steps.length ? [...new Set(steps)] : ["Review the evidence gathered and decide the next action."];
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint">
        <Icon className="size-3.5" /> {title}
      </div>
      {children}
    </div>
  );
}

function Fact({ label, children }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{children}</span>
    </div>
  );
}

function EscalationCard({ e }) {
  const s = e.summary || {};
  const order = s.order;
  const policy = s.policy_match;
  const reasons = s.reasons?.length ? s.reasons : [e.reason];
  const steps = guidanceFor([...reasons, policy?.reason]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-sunken px-5 py-3">
        <StatusChip value={e.urgency} label={`${titleCase(e.urgency)} urgency`} />
        <StatusChip value={e.status} />
        <span className="font-mono text-[12px] text-faint">#{shortId(e.ticket_id)}</span>
        <span className="text-[12.5px] text-faint">
          {e.tickets?.channel && `${channelName(e.tickets.channel)} · `}
          <span title={fmtDateTime(e.created_at)}>{timeAgo(e.created_at)}</span>
        </span>
        <Link
          to={`/tickets/${e.ticket_id}`}
          className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
        >
          Open full trail <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <div className="px-5 pt-4">
        <div className="text-[12px] font-medium text-muted">Customer message</div>
        <p className="mt-1 text-[15px] leading-relaxed text-ink">“{e.tickets?.raw_message || s.raw_message}”</p>
      </div>

      <div className="grid gap-6 px-5 py-5 lg:grid-cols-3">
        <Section icon={ScanSearch} title="What the system found">
          <div className="divide-y divide-line">
            <Fact label="Intent">
              {titleCase(s.intent)}
              {s.intent_confidence != null && <span className="tnum ml-1.5 text-faint">{pct(s.intent_confidence)}</span>}
            </Fact>
            <Fact label="Language">{langName(s.language)}</Fact>
            <Fact label="Customer">{s.customer?.full_name || e.tickets?.customer_id || "Unidentified"}</Fact>
            <Fact label="Order">
              {order ? `${order.order_id} · ${titleCase(order.status)} · ${inr(order.order_value)}` : "Not found"}
            </Fact>
            <Fact label="Policy">{policy?.policy ? `${policy.policy.code} · ${policy.policy.title}` : "None applicable"}</Fact>
          </div>
        </Section>

        <Section icon={ShieldAlert} title="Why it could not proceed">
          <ul className="space-y-2">
            {reasons.map((r, i) => (
              <li key={i} className="flex gap-2 text-[13.5px] leading-snug text-ink">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#d89a3c]" />
                {titleCase(r)}
              </li>
            ))}
          </ul>
          {policy?.reason && !reasons.includes(policy.reason) && <p className="mt-3 text-[12.5px] leading-snug text-muted">{policy.reason}</p>}
        </Section>

        <Section icon={ClipboardCheck} title="Reviewer next steps">
          <ol className="space-y-2">
            {steps.map((st, i) => (
              <li key={i} className="flex gap-2.5 text-[13.5px] leading-snug text-body">
                <span className="tnum mt-px grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11.5px] font-semibold text-accent">
                  {i + 1}
                </span>
                {st}
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </Card>
  );
}

export default function Escalations() {
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    setError("");
    listEscalations()
      .then(setRows)
      .catch(() => setError("Could not load escalations."))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const counts = useMemo(() => {
    const c = { all: rows.length, open: 0, in_review: 0, resolved: 0 };
    rows.forEach((r) => (c[r.status] = (c[r.status] || 0) + 1));
    return c;
  }, [rows]);
  const visible = tab === "all" ? rows : rows.filter((r) => r.status === tab);

  return (
    <>
      <PageHeader
        eyebrow="Queues"
        title="Escalations"
        description="Cases the copilot chose not to decide alone. Each arrives with what it found, why it stopped, and what to check next."
        actions={
          <Button icon={RefreshCw} onClick={load}>
            Refresh
          </Button>
        }
      />

      <div className="mb-4 inline-flex rounded-lg border border-line bg-surface p-0.5">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
              tab === t.value ? "bg-ink text-white" : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
            <span className={`tnum text-[12px] ${tab === t.value ? "text-white/70" : "text-faint"}`}>{counts[t.value] || 0}</span>
          </button>
        ))}
      </div>

      {error && <ErrorState onRetry={load}>{error}</ErrorState>}

      <div className="space-y-4">
        {loading && !rows.length && (
          <>
            <Skeleton className="h-60 w-full" />
            <Skeleton className="h-60 w-full" />
          </>
        )}
        {!loading && !error && visible.length === 0 && (
          <Card>
            <EmptyState icon={CheckCircle2} title={tab === "open" ? "Nothing waiting for review" : "No escalations here"}>
              {tab === "open"
                ? "No open escalations. Anything the copilot cannot safely decide will appear here."
                : "No escalations in this state."}
            </EmptyState>
          </Card>
        )}
        {visible.map((e) => (
          <EscalationCard key={e.id} e={e} />
        ))}
      </div>
    </>
  );
}
