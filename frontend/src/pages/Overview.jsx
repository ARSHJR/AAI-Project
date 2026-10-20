import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FlaskConical, RefreshCw } from "lucide-react";
import { getMetrics, listTickets } from "../lib/api";
import { actionLabel, channelName, langName, pct, fmtMs, timeAgo, titleCase } from "../lib/format";
import { Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton } from "../components/ui";
import StatusChip from "../components/StatusChip";

function Kpi({ label, value, sub, tone }) {
  return (
    <div className="px-6 py-5">
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div className={`tnum mt-1.5 text-[32px] font-semibold leading-none tracking-tight ${tone || "text-ink"}`}>
        {value}
      </div>
      {sub && <div className="mt-2 text-[12.5px] text-faint">{sub}</div>}
    </div>
  );
}

function OutcomeBar({ m }) {
  const parts = [
    { key: "auto_resolved", label: "Auto-resolved", value: m.auto_resolved, color: "bg-ok" },
    { key: "escalated", label: "Escalated to human", value: m.escalated, color: "bg-[#d89a3c]" },
    { key: "failed", label: "Failed", value: m.failed, color: "bg-bad" },
  ];
  const other = Math.max(0, m.total_tickets - m.auto_resolved - m.escalated - m.failed);
  if (other) parts.push({ key: "other", label: "In progress", value: other, color: "bg-line-strong" });
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-canvas">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div
              key={p.key}
              className={`${p.color} transition-all first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${(p.value / m.total_tickets) * 100}%` }}
              title={`${p.label}: ${p.value}`}
            />
          ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5">
        {parts.map((p) => (
          <div key={p.key} className="flex items-center gap-2 text-[13px]">
            <span className={`size-2.5 rounded-sm ${p.color}`} />
            <span className="text-muted">{p.label}</span>
            <span className="tnum font-semibold text-ink">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarList({ title, subtitle, data, format = titleCase, total }) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
  const denom = total || Math.max(1, ...entries.map(([, v]) => v));
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="space-y-3.5 px-5 py-4">
        {entries.length === 0 && <div className="py-3 text-[13px] text-faint">No data yet</div>}
        {entries.map(([name, value]) => (
          <div key={name}>
            <div className="mb-1 flex items-baseline justify-between text-[13px]">
              <span className="text-body">{format(name)}</span>
              <span className="tnum text-muted">
                <span className="font-semibold text-ink">{value}</span>
                {total ? <span className="ml-1.5 text-faint">{Math.round((value / total) * 100)}%</span> : null}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-canvas">
              <div className="h-full rounded-full bg-accent/80" style={{ width: `${(value / denom) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-28 w-full" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}

export default function Overview() {
  const [metrics, setMetrics] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    setError("");
    Promise.all([getMetrics(), listTickets({ limit: 6 })])
      .then(([m, t]) => {
        setMetrics(m);
        setRecent(t);
      })
      .catch(() => setError("Could not load operations metrics."))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const header = (
    <PageHeader
      eyebrow="Operations"
      title="Overview"
      description="How the copilot is performing across channels and languages — resolved on its own versus handed to people."
      actions={
        <Button icon={RefreshCw} onClick={load}>
          Refresh
        </Button>
      }
    />
  );

  if (error)
    return (
      <>
        {header}
        <ErrorState onRetry={load}>{error}</ErrorState>
      </>
    );
  if (loading && !metrics)
    return (
      <>
        {header}
        <OverviewSkeleton />
      </>
    );

  const m = metrics;
  if (!m.total_tickets)
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={FlaskConical}
            title="No tickets processed yet"
            action={
              <Link to="/simulate">
                <Button variant="primary" icon={FlaskConical}>
                  Run a scenario
                </Button>
              </Link>
            }
          >
            Metrics appear here as soon as messages move through the pipeline. Simulate a customer message to
            get started.
          </EmptyState>
        </Card>
      </>
    );

  const actionTotal = Object.values(m.action_distribution || {}).reduce((a, b) => a + b, 0);

  return (
    <>
      {header}

      <Card className="mb-5">
        <div className="grid divide-x divide-line md:grid-cols-4">
          <Kpi label="Total tickets" value={m.total_tickets} sub="Across chat, email and WhatsApp" />
          <Kpi
            label="Auto-resolution rate"
            value={pct(m.auto_resolution_rate, 1)}
            tone="text-ok"
            sub={`${m.auto_resolved} of ${m.total_tickets} closed without a human`}
          />
          <Kpi
            label="Escalated"
            value={m.escalated}
            sub={m.failed ? `${m.failed} failed` : "Routed to human review"}
          />
          <Kpi label="Avg. resolution time" value={fmtMs(m.avg_resolution_time_ms)} sub="Message in → reply drafted" />
        </div>
        <div className="border-t border-line px-6 py-5">
          <div className="mb-3 text-[12.5px] font-medium text-muted">Resolution outcome</div>
          <OutcomeBar m={m} />
        </div>
      </Card>

      <div className="mb-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <BarList
          title="Actions taken"
          subtitle="What the decision engine did"
          data={m.action_distribution}
          format={actionLabel}
          total={actionTotal}
        />
        <BarList
          title="Intent"
          subtitle="What customers asked for"
          data={m.intent_distribution}
          total={m.total_tickets}
        />
        <BarList title="Language" subtitle="Detected from the message" data={m.language_distribution} format={langName} total={m.total_tickets} />
        <BarList title="Channel" subtitle="Where it arrived" data={m.channel_distribution} format={channelName} total={m.total_tickets} />
      </div>

      <Card>
        <CardHeader
          title="Latest activity"
          right={
            <Link to="/tickets" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
              View all tickets <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        <ul className="divide-y divide-line">
          {recent.map((t) => (
            <li key={t.id}>
              <Link
                to={`/tickets/${t.id}`}
                className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-sunken"
              >
                <StatusChip value={t.status} className="w-[108px] justify-start" />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-body">{t.raw_message}</span>
                <span className="hidden text-[12.5px] text-muted md:block">{titleCase(t.intent)}</span>
                <span className="w-16 text-right text-[12.5px] text-faint">{timeAgo(t.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
