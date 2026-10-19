import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAudit } from "../lib/api";

export default function AuditHistory() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAudit({ limit: 150 })
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  function exportCsv() {
    const header = "created_at,ticket_id,actor,event_type,details\n";
    const body = rows
      .map((r) =>
        [r.created_at, r.ticket_id, r.actor, r.event_type, JSON.stringify(r.details).replace(/"/g, '""')]
          .map((v) => `"${v ?? ""}"`)
          .join(",")
      )
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Audit History</h1>
          <p className="text-sm text-slate-500 mt-1">
            Full decision trail for every ticket: intent → order data → policy → action.
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="text-sm font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700"
        >
          Export CSV
        </button>
      </div>

      <div className="bg-white rounded-xl ring-1 ring-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Time</th>
              <th className="text-left px-4 py-3">Ticket</th>
              <th className="text-left px-4 py-3">Actor</th>
              <th className="text-left px-4 py-3">Event</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2.5 text-xs text-slate-400">
                  {r.created_at ? new Date(r.created_at).toLocaleString() : "-"}
                </td>
                <td className="px-4 py-2.5">
                  {r.ticket_id ? (
                    <Link to={`/tickets/${r.ticket_id}`} className="text-indigo-600 hover:underline">
                      {r.ticket_id.slice(0, 8)}
                    </Link>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-600">{r.actor}</td>
                <td className="px-4 py-2.5 text-slate-600 capitalize">{r.event_type.replace(/_/g, " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
