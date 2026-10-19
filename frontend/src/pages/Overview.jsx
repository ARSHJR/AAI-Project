import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getMetrics } from "../lib/api";

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"];

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="bg-white rounded-xl ring-1 ring-slate-200 p-5">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`text-3xl font-semibold mt-1 ${accent || "text-slate-900"}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function DistributionChart({ title, data }) {
  const entries = Object.entries(data || {}).map(([name, value]) => ({ name, value }));
  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-xl ring-1 ring-slate-200 p-5">
        <div className="text-sm font-medium text-slate-700 mb-3">{title}</div>
        <div className="text-sm text-slate-400">No data yet</div>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl ring-1 ring-slate-200 p-5">
      <div className="text-sm font-medium text-slate-700 mb-3">{title}</div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={entries} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
            {entries.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-2 mt-2 justify-center">
        {entries.map((e, i) => (
          <span key={e.name} className="text-xs text-slate-500 flex items-center gap-1 capitalize">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: COLORS[i % COLORS.length] }} />
            {e.name.replace(/_/g, " ")} ({e.value})
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Overview() {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getMetrics().then(setMetrics).catch(() => setError("Could not load metrics."));
  }, []);

  if (error) return <div className="text-rose-600 text-sm">{error}</div>;
  if (!metrics) return <div className="text-slate-400 text-sm">Loading metrics...</div>;

  const actionEntries = Object.entries(metrics.action_distribution || {}).map(([name, value]) => ({
    name: name.replace(/_/g, " "),
    value,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Support Operations Overview</h1>
        <p className="text-sm text-slate-500 mt-1">
          Live view of autonomous resolution performance across all channels and languages.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Tickets" value={metrics.total_tickets} />
        <StatCard
          label="Auto-Resolved"
          value={metrics.auto_resolved}
          accent="text-emerald-600"
          sub={`${(metrics.auto_resolution_rate * 100).toFixed(1)}% auto-resolution rate`}
        />
        <StatCard label="Escalated" value={metrics.escalated} accent="text-amber-600" />
        <StatCard
          label="Avg Resolution Time"
          value={`${metrics.avg_resolution_time_ms} ms`}
          sub={metrics.failed ? `${metrics.failed} failed` : undefined}
        />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <DistributionChart title="Language Distribution" data={metrics.language_distribution} />
        <DistributionChart title="Intent Distribution" data={metrics.intent_distribution} />
        <DistributionChart title="Channel Distribution" data={metrics.channel_distribution} />
      </div>

      <div className="bg-white rounded-xl ring-1 ring-slate-200 p-5">
        <div className="text-sm font-medium text-slate-700 mb-3">Actions Taken</div>
        {actionEntries.length === 0 ? (
          <div className="text-sm text-slate-400">No actions recorded yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={actionEntries}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
