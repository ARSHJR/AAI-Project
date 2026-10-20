import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  CircleDashed,
  Clock,
  Database,
  FileText,
  Gavel,
  Globe,
  Inbox,
  MessageSquareReply,
  PackageSearch,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Target,
  UserSearch,
  X,
  Zap,
} from "lucide-react";
import { getTicket, retryTicket } from "../lib/api";
import { useAuth } from "../lib/auth";
import StatusChip from "../components/StatusChip";
import { Button, Card, ErrorState, JsonBlock, KV, Mono, Skeleton } from "../components/ui";
import {
  actionLabel,
  channelName,
  fmtDate,
  fmtDateTime,
  fmtFull,
  fmtMs,
  inr,
  langName,
  pct,
  shortId,
  titleCase,
} from "../lib/format";

/* ------------------------------------------------------------------ */
/* Derive pipeline stages from the real ticket + persisted events      */
/* ------------------------------------------------------------------ */

function buildStages(t) {
  const ev = {};
  (t.events || []).forEach((e) => {
    ev[e.step] = e; // last event per step wins (retries)
  });
  const order = ev.order_lookup?.payload?.order || null;
  const orderMissing = ev.order_lookup?.payload?.order_not_found;
  const policy = ev.policy_match?.payload || null;
  const decision = ev.decision?.payload || null;
  const exec = ev.action_execution?.payload || null;
  const repeat = ev.repeat_contact?.payload || null;
  const action = (t.actions || [])[0];
  const esc = t.escalation;
  const escalated = t.status === "escalated";
  const customer = esc?.summary?.customer || null;

  return [
    {
      key: "received",
      icon: Inbox,
      title: "Message received",
      phase: "Understand",
      state: "done",
      summary: `${channelName(t.channel)} · thread ${t.thread_id}`,
      time: t.created_at,
      content: (
        <>
          <p className="text-[14px] leading-relaxed text-ink">“{t.raw_message}”</p>
          <dl className="mt-2 divide-y divide-line">
            <KV label="Channel">{channelName(t.channel)}</KV>
            <KV label="Thread" mono>{t.thread_id}</KV>
            <KV label="Received">{fmtFull(t.created_at)}</KV>
          </dl>
        </>
      ),
    },
    {
      key: "language",
      icon: Globe,
      title: "Language understood",
      phase: "Understand",
      state: ev.language ? "done" : "skipped",
      summary: ev.language
        ? `${langName(t.detected_language)}${t.script === "romanized" ? " (romanized)" : ""}`
        : "Not recorded",
      raw: ev.language?.payload,
      content: ev.language && (
        <dl className="divide-y divide-line">
          <KV label="Detected language">{langName(ev.language.payload.detected_language)}</KV>
          <KV label="Script">{titleCase(ev.language.payload.script)}</KV>
          <KV label="Confidence">{pct(ev.language.payload.confidence)}</KV>
          {ev.language.payload.normalized && ev.language.payload.normalized !== t.raw_message && (
            <KV label="Normalized text">{ev.language.payload.normalized}</KV>
          )}
        </dl>
      ),
    },
    {
      key: "intent",
      icon: Target,
      title: "Intent classified",
      phase: "Understand",
      state: ev.intent ? "done" : "skipped",
      summary: ev.intent ? `${titleCase(t.intent)} · ${pct(t.intent_confidence)} confidence` : "Not recorded",
      raw: ev.intent?.payload,
      content: ev.intent && (
        <dl className="divide-y divide-line">
          <KV label="Primary intent">{titleCase(ev.intent.payload.intent)}</KV>
          <KV label="Confidence">{pct(ev.intent.payload.intent_confidence)}</KV>
          <KV label="Secondary intents">
            {(ev.intent.payload.multi_intent || []).length
              ? ev.intent.payload.multi_intent.map(titleCase).join(", ")
              : "None"}
          </KV>
        </dl>
      ),
    },
    {
      key: "identify",
      icon: UserSearch,
      title: "Customer & order identified",
      phase: "Retrieve",
      state: !ev.order_lookup ? "skipped" : orderMissing || !order ? "warn" : "done",
      summary: orderMissing
        ? `Order ${t.order_id || ""} not found`
        : order
          ? `${customer?.full_name ? customer.full_name + " · " : ""}${order.customer_id} · ${order.order_id}`
          : "No order referenced",
      content: (
        <dl className="divide-y divide-line">
          <KV label="Customer">
            {customer?.full_name ? `${customer.full_name} (${customer.id})` : order?.customer_id || t.customer_id || "Unidentified"}
          </KV>
          <KV label="Order" mono>{order?.order_id || t.order_id || "—"}</KV>
          {orderMissing && <KV label="Lookup result">No matching order in the system</KV>}
        </dl>
      ),
    },
    {
      key: "facts",
      icon: PackageSearch,
      title: "Order & shipment facts retrieved",
      phase: "Retrieve",
      state: !ev.order_lookup ? "skipped" : order ? "done" : "warn",
      summary: order
        ? `${titleCase(order.status)} · ${inr(order.order_value)}${order.is_delayed ? ` · ${order.delay_hours}h past ETA` : ""}`
        : "Nothing to retrieve",
      raw: ev.order_lookup?.payload,
      content: order && <OrderFacts order={order} />,
    },
    {
      key: "policy",
      icon: ScanSearch,
      title: "Policy matched",
      phase: "Reason",
      state: !ev.policy_match ? "skipped" : policy?.policy ? "done" : "warn",
      summary: policy?.policy
        ? `Policy ${policy.policy.code} · ${policy.policy.title}`
        : ev.policy_match
          ? "No policy applies to this intent"
          : "Not recorded",
      raw: ev.policy_match?.payload,
      content: ev.policy_match && (
        <>
          {policy.policy && (
            <div className="mb-2">
              <div className="text-[13.5px] font-semibold text-ink">
                Policy {policy.policy.code} · {policy.policy.title}
                <span className="ml-2 text-[12px] font-normal text-faint">v{policy.policy.version}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {Object.entries(policy.policy.conditions || {}).map(([k, v]) => (
                  <Mono key={k} className="rounded bg-canvas px-1.5 py-0.5 text-muted">
                    {k}: {String(v)}
                  </Mono>
                ))}
              </div>
            </div>
          )}
          <dl className="divide-y divide-line">
            <KV label="Rule satisfied">
              <StatusChip
                value={policy.eligible ? "success" : "escalated"}
                label={policy.eligible ? "Eligible" : "Not eligible"}
                tone={policy.eligible ? "ok" : "warn"}
              />
            </KV>
            <KV label="Evaluation">{policy.reason}</KV>
          </dl>
        </>
      ),
    },
    {
      key: "decision",
      icon: Gavel,
      title: "Decision made",
      phase: "Decide",
      state: ev.decision ? (escalated ? "warn" : "done") : "skipped",
      summary: ev.decision ? actionLabel(decision.decision) : "Not recorded",
      raw: { decision: ev.decision?.payload, repeat_contact: repeat },
      content: ev.decision && (
        <dl className="divide-y divide-line">
          <KV label="Decision">{actionLabel(decision.decision)}</KV>
          <KV label="Basis">{titleCase(decision.decision_reasoning?.cause)}</KV>
          {repeat && (
            <KV label="Repeat-contact check">
              {repeat.repeat_contact_count} unresolved contact{repeat.repeat_contact_count === 1 ? "" : "s"}
              {repeat.repeat_contact_escalate ? " — threshold reached" : ""}
            </KV>
          )}
          <KV label="Decided by">Deterministic rules (not the LLM)</KV>
        </dl>
      ),
    },
    {
      key: "act",
      icon: escalated ? ShieldAlert : Zap,
      title: escalated ? "Escalation created" : "Action executed",
      phase: "Act",
      state: escalated ? "warn" : ev.action_execution ? (exec?.status === "success" ? "done" : "fail") : "skipped",
      summary: escalated
        ? `Handed to human review · ${titleCase(esc?.urgency || t.urgency)} urgency`
        : action
          ? `${actionLabel(action.action_type)}${action.amount ? " · " + inr(action.amount) : ""}`
          : "No action required",
      raw: escalated ? ev.escalation?.payload : ev.action_execution?.payload,
      content: escalated ? (
        <dl className="divide-y divide-line">
          <KV label="Urgency">{titleCase(esc?.urgency || t.urgency)}</KV>
          <KV label="Reason">{t.escalation_reason}</KV>
          <KV label="Queue status">{esc ? titleCase(esc.status) : "—"}</KV>
        </dl>
      ) : (
        action && (
          <dl className="divide-y divide-line">
            <KV label="Action">{actionLabel(action.action_type)}</KV>
            {action.amount != null && <KV label="Amount">{inr(action.amount)}</KV>}
            <KV label="Reference" mono>{action.reference_id}</KV>
            <KV label="Idempotency key" mono>{action.idempotency_key}</KV>
          </dl>
        )
      ),
    },
    {
      key: "verify",
      icon: ShieldCheck,
      title: "Result verified",
      phase: "Verify",
      state: escalated
        ? esc
          ? "done"
          : "fail"
        : action
          ? action.status === "success"
            ? "done"
            : "fail"
          : exec?.status === "failed"
            ? "fail"
            : "skipped",
      summary: escalated
        ? esc
          ? "Handoff stored with full context"
          : "Handoff record missing"
        : action
          ? action.status === "success"
            ? `Recorded as ${action.reference_id}`
            : `Action ${action.status}`
          : "Nothing to verify",
      content: (
        <dl className="divide-y divide-line">
          <KV label="Ticket status">
            <StatusChip value={t.status} />
          </KV>
          {escalated ? (
            <KV label="Handoff record">{esc ? `Stored · ${titleCase(esc.status)}` : "Not found"}</KV>
          ) : (
            <KV label="Action record">{action ? titleCase(action.status) : "No action executed"}</KV>
          )}
          <KV label="Total resolution time">{fmtMs(t.resolution_time_ms)}</KV>
        </dl>
      ),
    },
    {
      key: "respond",
      icon: MessageSquareReply,
      title: "Customer response drafted",
      phase: "Respond",
      state: t.final_response ? "done" : "skipped",
      summary: t.final_response ? `Reply in ${langName(t.detected_language)}` : "No reply drafted",
      raw: ev.response_drafting?.payload,
      content: t.final_response && <Bubble text={t.final_response} />,
    },
  ];
}

function OrderFacts({ order }) {
  return (
    <div>
      <dl className="divide-y divide-line">
        <KV label="Status">{titleCase(order.status)}</KV>
        <KV label="Order value">{inr(order.order_value)}</KV>
        <KV label="Carrier">{order.carrier || "—"}</KV>
        <KV label="Placed">{fmtDate(order.placed_at)}</KV>
        <KV label="ETA">{fmtDate(order.eta)}</KV>
        {order.delivered_at && <KV label="Delivered">{fmtDate(order.delivered_at)}</KV>}
        <KV label="Delay">
          {order.is_delayed ? (
            <span className="font-medium text-warn">{order.delay_hours} h past ETA</span>
          ) : (
            "On schedule"
          )}
        </KV>
      </dl>
      {order.items?.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[12px] font-medium text-muted">Items</div>
          {order.items.map((it) => (
            <div key={it.id || it.sku} className="flex justify-between py-1 text-[13px]">
              <span className="text-body">
                {it.quantity} × {it.name}
              </span>
              <span className="tnum text-muted">{inr(it.price)}</span>
            </div>
          ))}
        </div>
      )}
      {order.shipment_events?.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[12px] font-medium text-muted">Shipment events</div>
          <ul className="space-y-1">
            {order.shipment_events.map((s) => (
              <li key={s.id} className="flex gap-3 text-[12.5px]">
                <span className="tnum w-24 shrink-0 text-faint">{fmtDateTime(s.occurred_at)}</span>
                <span className="text-body">
                  {s.description || titleCase(s.event_type)}
                  {s.location && <span className="text-faint"> · {s.location}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Bubble({ text }) {
  return (
    <div className="rounded-xl rounded-tl-sm border border-line bg-surface px-4 py-3 text-[14px] leading-relaxed text-ink">
      {text}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

const NODE = {
  done: { cls: "bg-ok text-white border-ok", Icon: Check },
  warn: { cls: "bg-[#d89a3c] text-white border-[#d89a3c]", Icon: null },
  fail: { cls: "bg-bad text-white border-bad", Icon: X },
  skipped: { cls: "bg-surface text-faint border-line-strong", Icon: CircleDashed },
};

function Stage({ stage, index, last, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const [showRaw, setShowRaw] = useState(false);
  const n = NODE[stage.state];
  const Icon = stage.icon;
  const expandable = !!stage.content;

  return (
    <li className="relative flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`z-10 grid size-8 shrink-0 place-items-center rounded-full border ${n.cls}`}>
          {n.Icon ? <n.Icon className="size-4" strokeWidth={2.4} /> : <Icon className="size-4" strokeWidth={2} />}
        </div>
        {!last && <div className="w-px flex-1 bg-line-strong" />}
      </div>

      <div className={`min-w-0 flex-1 ${last ? "" : "pb-5"}`}>
        <button
          type="button"
          onClick={() => expandable && setOpen((v) => !v)}
          aria-expanded={open}
          className={`flex w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-left transition-colors ${
            open ? "border-line-strong bg-surface" : "border-line bg-surface hover:border-line-strong"
          } ${stage.state === "skipped" ? "opacity-70" : ""}`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="tnum text-[11.5px] font-semibold text-faint">{String(index + 1).padStart(2, "0")}</span>
              <span className="text-[14px] font-semibold text-ink">{stage.title}</span>
              <span className="rounded bg-canvas px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wider text-faint">
                {stage.phase}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[13px] text-muted">{stage.summary}</div>
          </div>
          {expandable && (
            <ChevronDown className={`size-4 shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`} />
          )}
        </button>

        {open && expandable && (
          <div className="rise mt-2 rounded-lg border border-line bg-surface px-4 py-3">
            {stage.content}
            {stage.raw && (
              <div className="mt-3 border-t border-line pt-2">
                <button
                  type="button"
                  onClick={() => setShowRaw((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-faint hover:text-ink"
                >
                  <Database className="size-3.5" /> {showRaw ? "Hide" : "View"} raw event payload
                </button>
                {showRaw && (
                  <div className="mt-2">
                    <JsonBlock data={stage.raw} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Evidence → Rule → Decision → Action strip                           */
/* ------------------------------------------------------------------ */

function ChainCol({ label, icon: Icon, title, lines, tone = "default" }) {
  const border = tone === "warn" ? "border-[#e8c58b]" : tone === "ok" ? "border-[#9fd3b0]" : "border-line";
  return (
    <div className={`min-w-0 flex-1 rounded-xl border bg-surface p-4 ${border}`}>
      <div className="mb-2 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="text-[14.5px] font-semibold leading-snug text-ink">{title}</div>
      <ul className="mt-1.5 space-y-0.5">
        {lines.filter(Boolean).map((l, i) => (
          <li key={i} className="text-[12.5px] leading-snug text-muted">
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chain({ t }) {
  const ev = {};
  (t.events || []).forEach((e) => (ev[e.step] = e.payload));
  const order = ev.order_lookup?.order;
  const policy = ev.policy_match;
  const escalated = t.status === "escalated";
  const action = (t.actions || [])[0];
  const cause = ev.decision?.decision_reasoning?.cause;

  const evidenceTitle = order
    ? `${titleCase(order.status)} · ${inr(order.order_value)}`
    : ev.order_lookup?.order_not_found
      ? "Order not found"
      : "No order data";
  const evidenceLines = order
    ? [
        order.is_delayed ? `${order.delay_hours} h past ETA` : order.delivered_at ? `Delivered ${fmtDate(order.delivered_at)}` : "On schedule",
        `Order ${order.order_id} · ${order.carrier || "carrier n/a"}`,
        `Intent: ${titleCase(t.intent)} (${pct(t.intent_confidence)})`,
      ]
    : [`Intent: ${titleCase(t.intent)} (${pct(t.intent_confidence)})`];

  return (
    <div className="flex flex-col items-stretch gap-2 lg:flex-row">
      <ChainCol label="Evidence" icon={PackageSearch} title={evidenceTitle} lines={evidenceLines} />
      <ArrowRight className="mx-auto size-5 shrink-0 rotate-90 self-center text-line-strong lg:rotate-0" />
      <ChainCol
        label="Rule"
        icon={ScanSearch}
        title={policy?.policy ? `Policy ${policy.policy.code} · ${policy.policy.title}` : "No policy applies"}
        lines={[
          policy?.reason,
          ...Object.entries(policy?.policy?.conditions || {}).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`),
        ]}
      />
      <ArrowRight className="mx-auto size-5 shrink-0 rotate-90 self-center text-line-strong lg:rotate-0" />
      <ChainCol
        label="Decision"
        icon={Gavel}
        tone={escalated ? "warn" : "ok"}
        title={ev.decision ? actionLabel(ev.decision.decision) : "—"}
        lines={[cause ? `Basis: ${titleCase(cause)}` : null, "Rule-based, not LLM-decided"]}
      />
      <ArrowRight className="mx-auto size-5 shrink-0 rotate-90 self-center text-line-strong lg:rotate-0" />
      <ChainCol
        label="Action"
        icon={escalated ? ShieldAlert : Zap}
        tone={escalated ? "warn" : "ok"}
        title={
          escalated
            ? "Escalated to human"
            : action
              ? `${actionLabel(action.action_type)}${action.amount ? " · " + inr(action.amount) : ""}`
              : "No action needed"
        }
        lines={
          escalated
            ? [`Urgency: ${titleCase(t.escalation?.urgency || t.urgency)}`, t.escalation ? "Handoff stored" : null]
            : [action?.reference_id ? `Ref ${action.reference_id}` : null, action ? `Status: ${titleCase(action.status)}` : null]
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

export default function TicketDetail() {
  const { id } = useParams();
  const { staff } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [allOpen, setAllOpen] = useState(0);

  function load() {
    setError("");
    return getTicket(id)
      .then(setTicket)
      .catch(() => setError("Could not load this ticket."));
  }
  useEffect(() => {
    setTicket(null);
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onRetry() {
    setRetrying(true);
    try {
      await retryTicket(id);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Retry failed.");
    } finally {
      setRetrying(false);
    }
  }

  const back = (
    <Link to="/tickets" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
      <ArrowLeft className="size-3.5" /> Tickets
    </Link>
  );

  if (error && !ticket)
    return (
      <>
        {back}
        <ErrorState onRetry={load}>{error}</ErrorState>
      </>
    );
  if (!ticket)
    return (
      <>
        {back}
        <DetailSkeleton />
      </>
    );

  const canRetry = staff?.role === "supervisor" || staff?.role === "admin";
  const escalated = ticket.status === "escalated";
  const failed = ticket.status === "failed";
  const stages = buildStages(ticket);
  const bannerTone = failed
    ? "border-bad/30 bg-bad-soft text-bad"
    : escalated
      ? "border-[#e8c58b] bg-warn-soft text-warn"
      : "border-[#a6d6b6] bg-ok-soft text-ok";

  return (
    <>
      {back}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[24px] font-semibold tracking-tight text-ink">Ticket #{shortId(ticket.id)}</h1>
            <StatusChip value={ticket.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
            <span>{channelName(ticket.channel)}</span>
            <span>Customer {ticket.customer_id || "unidentified"}</span>
            <span>Order {ticket.order_id || "—"}</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> {fmtFull(ticket.created_at)}
            </span>
          </div>
        </div>
        {canRetry && (
          <Button icon={RotateCcw} loading={retrying} onClick={onRetry}>
            {retrying ? "Retrying…" : "Retry pipeline"}
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4">
          <ErrorState>{error}</ErrorState>
        </div>
      )}

      <div className={`mb-5 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl border px-5 py-3.5 ${bannerTone}`}>
        <div className="flex items-center gap-2.5">
          {failed ? <X className="size-5" /> : escalated ? <ShieldAlert className="size-5" /> : <ShieldCheck className="size-5" />}
          <div>
            <div className="text-[15px] font-semibold leading-tight">
              {failed ? "Processing failed" : escalated ? "Escalated to a human" : "Resolved automatically"}
            </div>
            <div className="text-[12.5px] opacity-80">
              {escalated ? ticket.escalation_reason : `${actionLabel(ticket.action_taken)}${ticket.actions?.[0]?.amount ? " · " + inr(ticket.actions[0].amount) : ""}`}
            </div>
          </div>
        </div>
        <div className="ml-auto flex gap-8 text-[12.5px]">
          <div>
            <div className="opacity-70">Language</div>
            <div className="text-[14px] font-semibold">{langName(ticket.detected_language)}</div>
          </div>
          <div>
            <div className="opacity-70">Intent</div>
            <div className="text-[14px] font-semibold">
              {titleCase(ticket.intent)} <span className="tnum font-normal opacity-80">{pct(ticket.intent_confidence)}</span>
            </div>
          </div>
          <div>
            <div className="opacity-70">Resolution time</div>
            <div className="tnum text-[14px] font-semibold">{fmtMs(ticket.resolution_time_ms)}</div>
          </div>
        </div>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-muted">
            <FileText className="size-3.5" /> Customer wrote
          </div>
          <p className="text-[14.5px] leading-relaxed text-ink">“{ticket.raw_message}”</p>
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-muted">
            <Bot className="size-3.5" /> Copilot replied
          </div>
          {ticket.final_response ? (
            <Bubble text={ticket.final_response} />
          ) : (
            <p className="text-[13.5px] text-faint">No reply drafted.</p>
          )}
        </Card>
      </div>

      <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">
        How the decision was reached
      </div>
      <div className="mb-7">
        <Chain t={ticket} />
      </div>

      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">Pipeline trail</h2>
          <p className="text-[13px] text-muted">
            Understand → Retrieve → Reason → Decide → Act → Verify → Respond
          </p>
        </div>
        <button
          onClick={() => setAllOpen((v) => (v === 1 ? 2 : 1))}
          className="text-[13px] font-medium text-accent hover:underline"
        >
          {allOpen === 1 ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <ol key={allOpen}>
        {stages.map((s, i) => (
          <Stage
            key={s.key}
            stage={s}
            index={i}
            last={i === stages.length - 1}
            defaultOpen={allOpen === 1}
          />
        ))}
      </ol>
    </>
  );
}
