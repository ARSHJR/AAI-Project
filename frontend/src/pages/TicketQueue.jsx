import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listTickets } from "../lib/api";
import StatusChip from "../components/StatusChip";

const CHANNEL_ICON = { whatsapp: "💬", email: "✉️", chat: "🗨️" };

export default function TicketQueue() {
  const [tickets, setTickets] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    listTickets({ status: statusFilter || undefined, channel: channelFilter || undefined })
      .then(setTickets)
      .finally(() => setLoading(false));
  }

  useEffect(load, [statusFilter, channelFilter]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Ticket Queue</h1>
          <p className="text-sm text-slate-500 mt-1">All tickets ingested across chat, email, and WhatsApp.</p>
        </div>
        <button onClick={load} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
          Refresh
        </button>
      </div>

      <div className="flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="auto_resolved">Auto-resolved</option>
          <option value="escalated">Escalated</option>
          <option value="failed">Failed</option>
          <option value="processing">Processing</option>
        </select>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">All channels</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
          <option value="chat">Chat</option>
        </select>
      </div>

      <div className="bg-white rounded-xl ring-1 ring-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Message</th>
              <th className="text-left px-4 py-3">Channel</th>
              <th className="text-left px-4 py-3">Language</th>
              <th className="text-left px-4 py-3">Intent</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Action</th>
              <th className="text-left px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && tickets.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  No tickets yet. Try "Simulate Message" to create one.
                </td>
              </tr>
            )}
            {tickets.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 max-w-xs truncate text-slate-700">{t.raw_message}</td>
                <td className="px-4 py-3">
                  {CHANNEL_ICON[t.channel] || ""} <span className="capitalize">{t.channel}</span>
                </td>
                <td className="px-4 py-3 uppercase text-xs font-medium text-slate-500">
                  {t.detected_language || "-"}
                </td>
                <td className="px-4 py-3 text-slate-600 capitalize">{(t.intent || "-").replace(/_/g, " ")}</td>
                <td className="px-4 py-3">
                  <StatusChip value={t.status} />
                </td>
                <td className="px-4 py-3 text-slate-600 capitalize">{(t.action_taken || "-").replace(/_/g, " ")}</td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/tickets/${t.id}`} className="text-indigo-600 font-medium hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
