import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listEscalations } from "../lib/api";
import StatusChip from "../components/StatusChip";

export default function Escalations() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listEscalations()
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Escalation Queue</h1>
        <p className="text-sm text-slate-500 mt-1">
          Tickets handed off to human agents with full investigation context attached.
        </p>
      </div>

      <div className="space-y-3">
        {loading && <div className="text-sm text-slate-400">Loading...</div>}
        {!loading && rows.length === 0 && (
          <div className="text-sm text-slate-400">No escalations yet — all routine tickets are auto-resolving.</div>
        )}
        {rows.map((e) => (
          <div key={e.id} className="bg-white rounded-xl ring-1 ring-slate-200 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusChip value={e.urgency} />
                <StatusChip value={e.status} />
              </div>
              <Link to={`/tickets/${e.ticket_id}`} className="text-sm text-indigo-600 font-medium hover:underline">
                Open ticket →
              </Link>
            </div>
            <div className="text-sm text-slate-700 mt-2">{e.reason}</div>
            {e.tickets?.raw_message && (
              <div className="text-xs text-slate-400 mt-1 italic">"{e.tickets.raw_message}"</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
