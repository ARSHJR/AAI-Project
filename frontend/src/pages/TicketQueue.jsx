import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FlaskConical, Mail, MessageCircle, MessagesSquare, RefreshCw, Search, SearchX } from "lucide-react";
import { Link } from "react-router-dom";
import { listTickets } from "../lib/api";
import { actionLabel, channelName, fmtDateTime, langName, pct, shortId, titleCase, timeAgo } from "../lib/format";
import { Button, Card, EmptyState, ErrorState, Mono, PageHeader, Skeleton, fieldCls } from "../components/ui";
import StatusChip from "../components/StatusChip";

const CHANNEL_ICON = { whatsapp: MessageCircle, email: Mail, chat: MessagesSquare };

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "auto_resolved", label: "Auto-resolved" },
  { value: "escalated", label: "Escalated" },
  { value: "failed", label: "Failed" },
];

export default function TicketQueue() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    setError("");
    listTickets({ status: statusFilter || undefined, channel: channelFilter || undefined, limit: 200 })
      .then(setTickets)
      .catch(() => setError("Could not load tickets."))
      .finally(() => setLoading(false));
  }
  useEffect(load, [statusFilter, channelFilter]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((t) =>
      [t.raw_message, t.id, t.customer_id, t.order_id, t.intent, t.thread_id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [tickets, query]);

  return (
    <>
      <PageHeader
        eyebrow="Queues"
        title="Tickets"
        description="Every customer message ingested across chat, email and WhatsApp, newest first."
        actions={
          <Button icon={RefreshCw} onClick={load}>
            Refresh
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-line bg-surface p-0.5">
          {STATUS_TABS.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                statusFilter === s.value ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select
          aria-label="Channel"
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className={`${fieldCls} !w-40`}
        >
          <option value="">All channels</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
          <option value="chat">Chat</option>
        </select>
        <div className="relative min-w-[240px] flex-1 md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search message, customer, order, ticket id"
            className={`${fieldCls} pl-9`}
          />
        </div>
        <div className="tnum ml-auto text-[13px] text-muted">
          {visible.length} {visible.length === 1 ? "ticket" : "tickets"}
        </div>
      </div>

      {error && <ErrorState onRetry={load}>{error}</ErrorState>}

      {!error && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[980px] text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-line bg-sunken text-[12px] font-semibold text-muted">
                  <th className="px-5 py-2.5">Ticket</th>
                  <th className="px-3 py-2.5">Channel</th>
                  <th className="px-3 py-2.5">Lang</th>
                  <th className="px-3 py-2.5">Intent</th>
                  <th className="px-3 py-2.5">Order</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Outcome</th>
                  <th className="px-5 py-2.5 text-right">Received</th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td colSpan={8} className="px-5 py-3.5">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))}
                {!loading &&
                  visible.map((t) => {
                    const Icon = CHANNEL_ICON[t.channel] || MessagesSquare;
                    return (
                      <tr
                        key={t.id}
                        onClick={() => navigate(`/tickets/${t.id}`)}
                        className="group cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-sunken"
                      >
                        <td className="max-w-[340px] px-5 py-3">
                          <Link
                            to={`/tickets/${t.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="block truncate font-medium text-ink group-hover:text-accent"
                          >
                            {t.raw_message}
                          </Link>
                          <div className="mt-0.5 flex gap-2 text-[12px] text-faint">
                            <Mono className="!text-[11.5px]">#{shortId(t.id)}</Mono>
                            {t.customer_id && <span>· {t.customer_id}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1.5 text-body">
                            <Icon className="size-3.5 text-faint" />
                            {channelName(t.channel)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-body">{langName(t.detected_language)}</td>
                        <td className="px-3 py-3">
                          <div className="text-body">{titleCase(t.intent)}</div>
                          {t.intent_confidence != null && (
                            <div className="tnum text-[12px] text-faint">{pct(t.intent_confidence)} confidence</div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Mono className="text-body">{t.order_id || "—"}</Mono>
                        </td>
                        <td className="px-3 py-3">
                          <StatusChip value={t.status} />
                        </td>
                        <td className="max-w-[220px] px-3 py-3">
                          <div className="text-body">{t.action_taken ? actionLabel(t.action_taken) : "—"}</div>
                          {t.escalation_reason && (
                            <div className="truncate text-[12px] text-warn" title={t.escalation_reason}>
                              {t.escalation_reason}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-right" title={fmtDateTime(t.created_at)}>
                          <div className="text-body">{timeAgo(t.created_at)}</div>
                          <div className="text-[12px] text-faint">{fmtDateTime(t.created_at)}</div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {!loading && visible.length === 0 && (
            <EmptyState
              icon={query || statusFilter || channelFilter ? SearchX : FlaskConical}
              title={query || statusFilter || channelFilter ? "No tickets match these filters" : "No tickets yet"}
              action={
                !(query || statusFilter || channelFilter) && (
                  <Link to="/simulate">
                    <Button variant="primary" icon={FlaskConical}>
                      Simulate a message
                    </Button>
                  </Link>
                )
              }
            >
              {query || statusFilter || channelFilter
                ? "Try clearing the search or changing the status and channel filters."
                : "Tickets show up here as customer messages are processed."}
            </EmptyState>
          )}
        </Card>
      )}
    </>
  );
}
