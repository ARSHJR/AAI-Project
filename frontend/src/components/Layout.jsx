import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  FlaskConical,
  Gauge,
  LogOut,
  ScrollText,
  ShieldAlert,
  Ticket,
  BookOpenCheck,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { listEscalations } from "../lib/api";

const GROUPS = [
  {
    label: "Operations",
    items: [
      { to: "/", label: "Overview", icon: Gauge },
      { to: "/simulate", label: "Simulate Message", icon: FlaskConical },
    ],
  },
  {
    label: "Queues",
    items: [
      { to: "/tickets", label: "Tickets", icon: Ticket },
      { to: "/escalations", label: "Escalations", icon: ShieldAlert, badge: true },
    ],
  },
  {
    label: "Governance",
    items: [
      { to: "/policies", label: "Policies", icon: BookOpenCheck },
      { to: "/audit", label: "Audit History", icon: ScrollText },
    ],
  },
];

const PIPELINE = ["Understand", "Retrieve", "Reason", "Decide", "Act", "Verify", "Respond"];

export default function Layout() {
  const { staff, logout } = useAuth();
  const location = useLocation();
  const [openEsc, setOpenEsc] = useState(null);

  useEffect(() => {
    let alive = true;
    listEscalations({ status_filter: "open" })
      .then((rows) => alive && setOpenEsc(rows.length))
      .catch(() => alive && setOpenEsc(null));
    return () => {
      alive = false;
    };
  }, [location.pathname]);

  const initials = (staff?.full_name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[248px] shrink-0 flex-col bg-nav text-nav-text">
        <div className="flex items-center gap-3 border-b border-nav-line px-5 py-[18px]">
          <img src="/favicon.svg" alt="" className="size-8 rounded-lg" />
          <div className="leading-tight">
            <div className="text-[14.5px] font-semibold text-white">Order Support Copilot</div>
            <div className="text-[11.5px] text-nav-text/80">Multilingual · Agentic</div>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.09em] text-nav-text/55">
                {g.label}
              </div>
              <div className="space-y-0.5">
                {g.items.map(({ to, label, icon: Icon, badge }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === "/"}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors ${
                        isActive ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute -left-3 top-2 h-5 w-[3px] rounded-r bg-[#5b8cff]" />}
                        <Icon className="size-[17px] shrink-0" strokeWidth={1.9} />
                        <span className="flex-1">{label}</span>
                        {badge && openEsc > 0 && (
                          <span className="tnum rounded-md bg-[#f0b45a]/20 px-1.5 text-[11.5px] font-semibold text-[#f0b45a]">
                            {openEsc}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-nav-line px-5 py-4">
          <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-nav-text/50">
            Resolution pipeline
          </div>
          <div className="text-[11.5px] leading-[1.7] text-nav-text/80">{PIPELINE.join(" → ")}</div>
        </div>

        <div className="flex items-center gap-3 border-t border-nav-line px-4 py-3.5">
          <div className="grid size-8 place-items-center rounded-full bg-white/10 text-[12px] font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-medium text-white">{staff?.full_name}</div>
            <div className="text-[11.5px] capitalize text-nav-text/80">{staff?.role}</div>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-md p-1.5 text-nav-text/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div key={location.pathname} className="rise mx-auto max-w-[1280px] px-10 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
