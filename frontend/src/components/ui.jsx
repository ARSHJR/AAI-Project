import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

export function PageHeader({ title, description, actions, eyebrow }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">{eyebrow}</div>
        )}
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[14px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className = "", children, ...rest }) {
  return (
    <div className={`rounded-xl border border-line bg-surface ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
      <div>
        <div className="text-[14px] font-semibold text-ink">{title}</div>
        {subtitle && <div className="mt-0.5 text-[12.5px] text-muted">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

const BTN = {
  primary: "bg-accent text-white hover:bg-accent-hover border-transparent shadow-sm",
  dark: "bg-ink text-white hover:bg-body border-transparent shadow-sm",
  secondary: "bg-surface text-body hover:bg-sunken border-line-strong",
  ghost: "bg-transparent text-muted hover:bg-canvas hover:text-ink border-transparent",
};

export function Button({ variant = "secondary", loading, icon: Icon, children, className = "", ...rest }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3.5 text-[13.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${BTN[variant]} ${className}`}
    >
      {loading ? <Loader2 className="size-4 spin" /> : Icon ? <Icon className="size-4" /> : null}
      {children}
    </button>
  );
}

export const fieldCls =
  "h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] text-ink placeholder:text-faint transition-colors hover:border-faint focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15";

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-faint">{hint}</span>}
    </label>
  );
}

export function Skeleton({ className = "" }) {
  return <div className={`skeleton ${className}`} />;
}

export function EmptyState({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 grid size-10 place-items-center rounded-full bg-canvas text-faint">
        <Icon className="size-5" />
      </div>
      <div className="text-[14.5px] font-semibold text-ink">{title}</div>
      {children && <p className="mt-1 max-w-sm text-[13px] text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ children, onRetry }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-bad/25 bg-bad-soft px-4 py-3 text-[13.5px] text-bad">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">{children}</div>
      {onRetry && (
        <button onClick={onRetry} className="font-medium underline underline-offset-2">
          Retry
        </button>
      )}
    </div>
  );
}

export function Mono({ children, className = "" }) {
  return <span className={`font-mono text-[12.5px] ${className}`}>{children}</span>;
}

export function JsonBlock({ data }) {
  if (data === null || data === undefined) return null;
  return (
    <pre className="scrollbar-thin max-h-72 overflow-auto rounded-lg border border-line bg-sunken p-3 font-mono text-[11.5px] leading-relaxed text-muted">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export function KV({ label, children, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-[13px]">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`min-w-0 text-right text-ink ${mono ? "font-mono text-[12.5px]" : ""}`}>{children}</dd>
    </div>
  );
}
