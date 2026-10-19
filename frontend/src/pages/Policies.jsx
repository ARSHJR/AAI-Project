import { useEffect, useState } from "react";
import { listPolicies } from "../lib/api";

export default function Policies() {
  const [policies, setPolicies] = useState([]);

  useEffect(() => {
    listPolicies().then(setPolicies);
  }, []);

  const grouped = policies.reduce((acc, p) => {
    (acc[p.category] = acc[p.category] || []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Support Policies</h1>
        <p className="text-sm text-slate-500 mt-1">
          Active, versioned rules the decision agent evaluates against order facts. Every automated
          action traces back to one of these clauses.
        </p>
      </div>

      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
            {category.replace(/_/g, " ")}
          </h2>
          <div className="space-y-3">
            {items.map((p) => (
              <div key={p.id} className="bg-white rounded-xl ring-1 ring-slate-200 p-5">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-slate-800">
                    Policy {p.code} — {p.title}
                  </div>
                  <span className="text-xs text-slate-400">v{p.version}</span>
                </div>
                <p className="text-sm text-slate-600 mt-2">{p.body}</p>
                {p.conditions && Object.keys(p.conditions).length > 0 && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {Object.entries(p.conditions).map(([k, v]) => (
                      <span key={k} className="text-xs bg-slate-100 text-slate-600 rounded-full px-3 py-1">
                        {k.replace(/_/g, " ")}: {String(v)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {policies.length === 0 && (
        <div className="text-sm text-slate-400">
          No policies loaded. Run the seed script to populate support policies.
        </div>
      )}
    </div>
  );
}
