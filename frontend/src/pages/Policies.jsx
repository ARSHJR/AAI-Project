import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { listPolicies } from "../lib/api";
import { fmtDate, titleCase } from "../lib/format";
import { Card, EmptyState, ErrorState, Mono, PageHeader, Skeleton } from "../components/ui";
import StatusChip from "../components/StatusChip";

// What happens when the rule is satisfied, keyed by policy category.
const OUTCOME = {
  delivery_delay: "Issue delay compensation credit",
  refund: "Approve refund automatically",
  wrong_item: "Approve refund automatically",
  damaged_item: "Approve refund automatically",
  return: "Initiate return and generate label",
  high_value: "Escalate to supervisor",
  escalation: "Route to human agent",
  general: "Route to human review",
  cancellation: "Process cancellation",
};

const CRITERIA = {
  delay_hours_gt: ["Delay exceeds", (v) => `${v} hours past ETA`],
  auto_approve_max_inr: ["Order value up to", (v) => `₹${Number(v).toLocaleString("en-IN")}`],
  threshold_inr: ["Order value above", (v) => `₹${Number(v).toLocaleString("en-IN")}`],
  window_days: ["Within", (v) => `${v} days of delivery`],
};

function Criteria({ conditions }) {
  const entries = Object.entries(conditions || {});
  if (!entries.length) return <span className="text-faint">Evaluated case by case</span>;
  return (
    <ul className="space-y-1">
      {entries.map(([k, v]) => {
        const c = CRITERIA[k];
        return (
          <li key={k} className="text-[13px]">
            {c ? (
              <>
                <span className="text-muted">{c[0]} </span>
                <span className="tnum font-medium text-ink">{c[1](v)}</span>
              </>
            ) : (
              <Mono>
                {k}: {String(v)}
              </Mono>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function Policies() {
  const [policies, setPolicies] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listPolicies()
      .then(setPolicies)
      .catch(() => setError("Could not load policies."));
  }, []);

  const sorted = (policies || []).slice().sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));

  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Policies"
        description="The versioned rules the decision engine evaluates against order facts. Every automated action traces back to one of these."
      />

      {error && <ErrorState>{error}</ErrorState>}
      {!policies && !error && <Skeleton className="h-96 w-full" />}

      {policies && policies.length === 0 && (
        <Card>
          <EmptyState icon={BookOpen} title="No policies loaded">
            Run the seed script to populate support policies.
          </EmptyState>
        </Card>
      )}

      {sorted.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[960px] text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-line bg-sunken text-[12px] font-semibold text-muted">
                  <th className="px-5 py-2.5">Code</th>
                  <th className="px-3 py-2.5">Policy</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Criteria</th>
                  <th className="px-3 py-2.5">Outcome</th>
                  <th className="px-3 py-2.5">Version</th>
                  <th className="px-3 py-2.5">Effective</th>
                  <th className="px-5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.id} className="border-b border-line align-top last:border-0">
                    <td className="px-5 py-4">
                      <Mono className="rounded bg-canvas px-1.5 py-0.5 font-medium text-ink">{p.code}</Mono>
                    </td>
                    <td className="max-w-[360px] px-3 py-4">
                      <div className="font-semibold text-ink">{p.title}</div>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{p.body}</p>
                    </td>
                    <td className="px-3 py-4 text-body">{titleCase(p.category)}</td>
                    <td className="px-3 py-4">
                      <Criteria conditions={p.conditions} />
                    </td>
                    <td className="px-3 py-4 text-body">{OUTCOME[p.category] || "—"}</td>
                    <td className="tnum px-3 py-4 text-body">v{p.version}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-body">{fmtDate(p.effective_from)}</td>
                    <td className="px-5 py-4">
                      <StatusChip value={p.is_active ? "active" : "inactive"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
