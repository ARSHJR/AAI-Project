export const titleCase = (s) =>
  s ? String(s).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—";

export const LANG = { en: "English", hi: "Hindi", mr: "Marathi" };
export const langName = (code) => LANG[code] || (code ? code.toUpperCase() : "—");

export const CHANNEL = { whatsapp: "WhatsApp", email: "Email", chat: "Chat" };
export const channelName = (c) => CHANNEL[c] || titleCase(c);

export const ACTION_LABEL = {
  reply_only: "Informational reply",
  delay_credit: "Delay credit",
  refund: "Refund",
  return_initiation: "Return initiated",
  escalation: "Escalated to human",
};
export const actionLabel = (a) => ACTION_LABEL[a] || titleCase(a);

export const inr = (n) =>
  n == null || n === ""
    ? "—"
    : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export const pct = (n, digits = 0) => (n == null ? "—" : `${(n * 100).toFixed(digits)}%`);

const dt = (opts) => (v) => (v ? new Date(v).toLocaleString("en-IN", opts) : "—");

export const fmtDateTime = dt({ day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
export const fmtFull = dt({
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
export const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export function timeAgo(v) {
  if (!v) return "—";
  const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const fmtMs = (ms) => {
  if (!ms) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
};

export const shortId = (id) => (id ? String(id).slice(0, 8) : "—");
