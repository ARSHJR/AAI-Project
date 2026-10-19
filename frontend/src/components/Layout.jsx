import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

const NAV = [
  { to: "/", label: "Overview", icon: "📊" },
  { to: "/tickets", label: "Ticket Queue", icon: "🎫" },
  { to: "/escalations", label: "Escalations", icon: "🚨" },
  { to: "/policies", label: "Policies", icon: "📘" },
  { to: "/audit", label: "Audit History", icon: "🧾" },
  { to: "/simulate", label: "Simulate Message", icon: "💬" },
];

export default function Layout() {
  const { staff, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="font-semibold text-slate-900 text-lg leading-tight">Support Copilot</div>
          <div className="text-xs text-slate-400 mt-0.5">PS-14 · Multilingual Agent</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-slate-100">
          <div className="text-sm font-medium text-slate-800">{staff?.full_name}</div>
          <div className="text-xs text-slate-400 capitalize mb-2">{staff?.role}</div>
          <button
            onClick={logout}
            className="text-xs font-medium text-slate-500 hover:text-rose-600"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
