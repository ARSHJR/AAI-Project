import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getTicket, retryTicket } from "../lib/api";
import StatusChip from "../components/StatusChip";
import { useAuth } from "../lib/auth";

const STEP_LABELS = {
  language: "Language Detected",
  intent: "Intent Classified",
  order_lookup: "Order & Shipment Retrieved",
  policy_match: "Policy Matched",
  repeat_contact: "Repeat-Contact Check",
  decision: "Action Decision",
  action_execution: "Action Executed",
  escalation: "Escalated to Human",
  response_drafting: "Response Drafted",
};

const STEP_ICON = {
  language: "🌐",
  intent: "🎯",
  order_lookup: "📦",
  policy_match: "📘",
  repeat_contact: "🔁",
  decision: "🧭",
  action_execution: "⚙️",
  escalation: "🚨",
  response_drafting: "💬",
};

function JsonBlock({ data }) {
  if (data === null || data === undefined) return null;
  return (
    <pre className="text-xs bg-slate-50 rounded-lg p-3 mt-2 overflow-x-auto text-slate-600 scrollbar-thin">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function PipelineStep({ event }) {
  const [open, setOpen] = useState(false);
  const label = STEP_LABELS[event.step] || event.step;
  const icon = STEP_ICON[event.step] || "•";
  const errorStyle =
    event.status === "error" ? "ring-rose-200 bg-rose-50" : event.status === "retry" ? "ring-amber-200 bg-amber-50" : "ring-slate-200 bg-white";

  return (
    <div className="relative pl-10">
      <div className="absolute left-0 top-0.5 w-7 h-7 rounded-full bg-indigo-600 text-white text-sm flex items-center justify-center">
        {icon}
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full text-left rounded-lg ring-1 px-4 py-3 ${errorStyle}`}
      >
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm text-slate-800">{label}</span>
          <span className="text-xs text-slate-400">{open ? "Hide details ▲" : "Show details ▼"}</span>
        </div>
      </button>
      {open && <JsonBlock data={event.payload} />}
    </div>
  );
}

export default function TicketDetail() {
  const { id } = useParams();
  const { staff } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);

  function load() {
    getTicket(id).then(setTicket).catch(() => setError("Could not load this ticket."));
  }

  useEffect(load, [id]);

  async function onRetry() {
    setRetrying(true);
    try {
      await retryTicket(id);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Retry failed.");
    } finally {
      setRetrying(false);
    }
  }

  if (error) return <div className="text-rose-600 text-sm">{error}</div>;
  if (!ticket) return <div className="text-slate-400 text-sm">Loading...</div>;

  const canRetry = staff?.role === "supervisor" || staff?.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/tickets" className="text-xs text-indigo-600 hover:underline">
            ← Back to queue
          </Link>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">Ticket {ticket.id.slice(0, 8)}</h1>
        </div>
        <div className="flex items-center gap-3">
          <StatusChip value={ticket.status} />
          {canRetry && (
            <button
              onClick={onRetry}
              disabled={retrying}
              className="text-sm font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {retrying ? "Retrying..." : "Retry pipeline"}
            </button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-white rounded-xl ring-1 ring-slate-200 p-5">
          <div className="text-xs font-medium text-slate-400 uppercase mb-1">Customer Message</div>
          <div className="text-slate-800">{ticket.raw_message}</div>
          <div className="flex gap-4 mt-3 text-xs text-slate-500">
            <span className="capitalize">Channel: {ticket.channel}</span>
            <span>Thread: {ticket.thread_id}</span>
            {ticket.detected_language && <span className="uppercase">Language: {ticket.detected_language}</span>}
          </div>
        </div>
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-5">
          <div className="text-xs font-medium text-slate-400 uppercase mb-1">Final Response</div>
          <div className="text-slate-800 text-sm">{ticket.final_response || "Not yet drafted."}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 text-sm">
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-4">
          <div className="text-xs text-slate-400">Intent</div>
          <div className="font-medium capitalize text-slate-800">
            {(ticket.intent || "-").replace(/_/g, " ")}{" "}
            {ticket.intent_confidence != null && (
              <span className="text-xs text-slate-400">({(ticket.intent_confidence * 100).toFixed(0)}%)</span>
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-4">
          <div className="text-xs text-slate-400">Action Taken</div>
          <div className="font-medium capitalize text-slate-800">{(ticket.action_taken || "-").replace(/_/g, " ")}</div>
        </div>
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-4">
          <div className="text-xs text-slate-400">Resolution Time</div>
          <div className="font-medium text-slate-800">{ticket.resolution_time_ms ? `${ticket.resolution_time_ms} ms` : "-"}</div>
        </div>
      </div>

      {ticket.escalation && (
        <div className="bg-amber-50 ring-1 ring-amber-200 rounded-xl p-5">
          <div className="text-sm font-semibold text-amber-800">Escalation Handoff Summary</div>
          <div className="text-xs text-amber-700 mt-1">
            Urgency: <span className="font-medium capitalize">{ticket.escalation.urgency}</span> · Reason:{" "}
            {ticket.escalation.reason}
          </div>
          <JsonBlock data={ticket.escalation.summary} />
        </div>
      )}

      {ticket.actions?.length > 0 && (
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-5">
          <div className="text-sm font-semibold text-slate-800 mb-2">Actions Executed</div>
          <div className="space-y-2">
            {ticket.actions.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm border border-slate-100 rounded-lg px-3 py-2">
                <span className="capitalize">{a.action_type.replace(/_/g, " ")}</span>
                <span className="text-slate-500">{a.amount ? `₹${a.amount}` : ""}</span>
                <span className="text-xs text-slate-400">{a.reference_id}</span>
                <StatusChip value={a.status === "success" ? "auto_resolved" : "failed"} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-slate-800 mb-3">
          Agentic Pipeline Trail — Understand → Retrieve → Reason → Decide → Act → Verify → Respond
        </h2>
        <div className="space-y-4 border-l border-slate-200 ml-3.5">
          {(ticket.events || []).map((event, i) => (
            <PipelineStep key={event.id || i} event={event} />
          ))}
          {(!ticket.events || ticket.events.length === 0) && (
            <div className="text-sm text-slate-400 pl-10">No pipeline events recorded.</div>
          )}
        </div>
      </div>
    </div>
  );
}
