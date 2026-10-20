import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Loader2,
  Mail,
  MessageCircle,
  MessagesSquare,
  Send,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { createTicket } from "../lib/api";
import { actionLabel, channelName, fmtMs, inr, langName, pct, titleCase } from "../lib/format";
import { Button, Card, CardHeader, ErrorState, Field, KV, Mono, PageHeader, fieldCls } from "../components/ui";

const PRESETS = [
  {
    id: "delay-hinglish",
    label: "Delayed delivery (Hinglish)",
    focus: "Delay policy",
    blurb: "Romanized Hindi on WhatsApp. Exercises language detection and the delay-compensation rule (Policy 6.1).",
    channel: "whatsapp",
    customer_id: "C-7719",
    order_id: "IN48213",
    text: "Mera order 3 din se late hai, kab aayega?",
  },
  {
    id: "tracking-en",
    label: "Order tracking (English)",
    focus: "Retrieval",
    blurb: "Plain English where-is-my-order question. Exercises live shipment retrieval and an informational reply.",
    channel: "chat",
    customer_id: "C-5502",
    order_id: "IN51092",
    text: "Where is my order? It was supposed to arrive yesterday.",
  },
  {
    id: "wrong-item",
    label: "Wrong item, wants refund",
    focus: "Refund policy",
    blurb: "Delivered, low-value order. Exercises the auto-approval cap on refunds (Policy 4.3).",
    channel: "email",
    customer_id: "C-3381",
    order_id: "IN33087",
    text: "I received the wrong item in my order, I need a refund please.",
  },
  {
    id: "return-mr",
    label: "Return request (Marathi)",
    focus: "Return policy",
    blurb: "Romanized Marathi. Exercises the return-window check against delivery date (Policy 5.1).",
    channel: "whatsapp",
    customer_id: "C-3381",
    order_id: "IN22456",
    text: "Mala ha product return karaycha aahe, tyat problem aahe.",
  },
  {
    id: "high-value",
    label: "High-value refund",
    focus: "Escalation",
    blurb: "₹18,400 order, far above the auto-approval cap. Exercises safe escalation before money moves (Policy 7.1).",
    channel: "email",
    customer_id: "C-9120",
    order_id: "IN77001",
    text: "The TV I ordered arrived with a cracked screen, I want a full refund.",
  },
  {
    id: "not-found",
    label: "Order not found",
    focus: "Escalation",
    blurb: "Order number that doesn't exist. Exercises graceful escalation when the evidence is missing.",
    channel: "chat",
    customer_id: "C-6671",
    order_id: "IN00000",
    text: "Where is my order IN00000?",
  },
  {
    id: "cancelled-claim",
    label: "Delay claim on cancelled order",
    focus: "Escalation",
    blurb: "Compensation requested for an order cancelled before dispatch. Exercises ambiguity handling (Policy 9.1).",
    channel: "whatsapp",
    customer_id: "C-4456",
    order_id: "IN60099",
    text: "Mera order abhi tak nahi aaya, delay compensation chahiye.",
  },
  {
    id: "repeat",
    label: "Repeat contact",
    focus: "Memory",
    blurb: "Third chase on the same stuck order. Send it repeatedly (30 s apart) to trigger repeat-contact escalation.",
    channel: "whatsapp",
    customer_id: "C-6671",
    order_id: "IN68211",
    text: "Still no update on my order, this is the third time I'm asking!",
  },
];

const CHANNELS = [
  { value: "whatsapp", icon: MessageCircle },
  { value: "email", icon: Mail },
  { value: "chat", icon: MessagesSquare },
];

const RUN_STAGES = [
  "Detecting language",
  "Classifying intent",
  "Retrieving order & shipment",
  "Matching policy",
  "Deciding action",
  "Acting & drafting reply",
];

const toForm = (p) => ({
  channel: p.channel,
  thread_id: `T-DEMO-${p.order_id}`,
  customer_id: p.customer_id,
  order_id: p.order_id,
  text: p.text,
});

function RunningPanel() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => Math.min(v + 1, RUN_STAGES.length - 1)), 1100);
    return () => clearInterval(t);
  }, []);
  return (
    <Card className="rise p-5" aria-live="polite">
      <div className="mb-4 flex items-center gap-2.5 text-[14px] font-semibold text-ink">
        <Loader2 className="size-4 spin text-accent" /> Pipeline running
      </div>
      <ol className="space-y-2">
        {RUN_STAGES.map((s, idx) => (
          <li
            key={s}
            className={`flex items-center gap-2.5 text-[13.5px] transition-colors ${
              idx < i ? "text-muted" : idx === i ? "font-medium text-ink" : "text-faint"
            }`}
          >
            {idx < i ? (
              <CheckCircle2 className="size-4 text-ok" />
            ) : idx === i ? (
              <span className="grid size-4 place-items-center">
                <span className="size-2 rounded-full bg-accent pulse-dot" />
              </span>
            ) : (
              <span className="grid size-4 place-items-center">
                <span className="size-1.5 rounded-full bg-line-strong" />
              </span>
            )}
            {s}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ResultPanel({ result, channel }) {
  if (result.duplicate) {
    return (
      <Card className="rise p-5">
        <div className="text-[14px] font-semibold text-ink">Duplicate message ignored</div>
        <p className="mt-1 text-[13.5px] text-muted">
          The same message on this thread was received in the last 30 seconds, so it was not reprocessed
          (deduplication guard).
        </p>
        <Link to={`/tickets/${result.id}`} className="mt-3 inline-flex items-center gap-1 text-[13.5px] font-medium text-accent hover:underline">
          Open the existing ticket <ArrowRight className="size-3.5" />
        </Link>
      </Card>
    );
  }

  const ticketId = result.id || result.ticket_id;
  const escalated = result.status === "escalated";
  const failed = result.status === "failed";
  const Banner = failed ? XCircle : escalated ? ShieldAlert : CheckCircle2;
  const tone = failed ? "bg-bad-soft text-bad" : escalated ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok";
  const headline = failed ? "Processing failed" : escalated ? "Escalated to a human" : "Auto-resolved";
  const policy = result.policy_match?.policy;
  const action = result.action_result;

  return (
    <Card className="rise overflow-hidden">
      <div className={`flex items-center gap-3 px-5 py-4 ${tone}`}>
        <Banner className="size-6 shrink-0" strokeWidth={1.8} />
        <div className="flex-1">
          <div className="text-[16px] font-semibold leading-tight">{headline}</div>
          <div className="text-[12.5px] opacity-80">
            {escalated
              ? result.escalation_reason
              : `${actionLabel(result.decision)}${action?.amount ? ` · ${inr(action.amount)}` : ""}`}
          </div>
        </div>
        <div className="tnum text-right text-[12.5px] opacity-80">
          <div>Resolved in</div>
          <div className="text-[15px] font-semibold">{fmtMs(result.resolution_time_ms)}</div>
        </div>
      </div>

      <div className="grid gap-x-8 px-5 py-3 md:grid-cols-2">
        <dl className="divide-y divide-line">
          <KV label="Language">
            {langName(result.detected_language)}
            {result.script === "romanized" && <span className="ml-1.5 text-faint">(romanized)</span>}
          </KV>
          <KV label="Intent">
            {titleCase(result.intent)}
            {result.intent_confidence != null && (
              <span className="tnum ml-1.5 text-faint">{pct(result.intent_confidence)}</span>
            )}
          </KV>
        </dl>
        <dl className="divide-y divide-line">
          <KV label="Policy matched">{policy ? `${policy.code} · ${policy.title}` : "None"}</KV>
          <KV label="Action">
            {actionLabel(result.decision)}
            {action?.reference_id && <Mono className="ml-1.5 text-faint">{action.reference_id}</Mono>}
          </KV>
        </dl>
      </div>

      <div className="border-t border-line bg-sunken px-5 py-4">
        <div className="mb-2 flex items-center justify-between text-[12px] font-medium text-muted">
          <span>Reply sent to customer · {channelName(channel)}</span>
          <button
            onClick={() => navigator.clipboard?.writeText(result.final_response || "")}
            className="inline-flex items-center gap-1 text-faint transition-colors hover:text-ink"
          >
            <Copy className="size-3.5" /> Copy
          </button>
        </div>
        <div className="rounded-xl rounded-tl-sm border border-line bg-surface px-4 py-3 text-[14px] leading-relaxed text-ink">
          {result.final_response || "No reply was generated."}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line px-5 py-3.5">
        <span className="text-[12.5px] text-muted">Every step, rule and fact behind this outcome is recorded.</span>
        <Link to={`/tickets/${ticketId}`}>
          <Button variant="dark" icon={ArrowRight} className="flex-row-reverse">
            Open pipeline trail
          </Button>
        </Link>
      </div>
    </Card>
  );
}

export default function Simulate() {
  const [selected, setSelected] = useState(PRESETS[0].id);
  const [form, setForm] = useState(toForm(PRESETS[0]));
  const [result, setResult] = useState(null);
  const [sentChannel, setSentChannel] = useState(form.channel);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const resultRef = useRef(null);

  function pick(p) {
    setSelected(p.id);
    setForm(toForm(p));
    setResult(null);
    setError("");
  }

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    setSelected("custom");
  };

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setSentChannel(form.channel);
    try {
      setResult(await createTicket(form));
    } catch (err) {
      setError(err.response?.data?.detail || "Could not process this message.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (result || error) resultRef.current?.scrollIntoView({ block: "nearest" });
  }, [result, error]);

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Simulate Message"
        description="Drive a customer message through the full pipeline live. Pick a scenario or write your own."
      />

      <div className="grid items-start gap-6 xl:grid-cols-[400px_1fr]">
        <Card className="overflow-hidden">
          <CardHeader title="Scenarios" subtitle="Seeded customers and orders" />
          <ul className="divide-y divide-line" role="listbox" aria-label="Scenarios">
            {PRESETS.map((p) => {
              const active = selected === p.id;
              return (
                <li key={p.id}>
                  <button
                    role="option"
                    aria-selected={active}
                    onClick={() => pick(p)}
                    className={`relative block w-full px-5 py-3 text-left transition-colors ${
                      active ? "bg-accent-soft" : "hover:bg-sunken"
                    }`}
                  >
                    {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" />}
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-[13.5px] font-semibold ${active ? "text-accent" : "text-ink"}`}>
                        {p.label}
                      </span>
                      <span className="shrink-0 rounded bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-muted">
                        {p.focus}
                      </span>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-snug text-muted">{p.blurb}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-5">
          <Card>
            <form onSubmit={onSubmit}>
              <CardHeader
                title="Incoming message"
                subtitle={selected === "custom" ? "Custom message" : PRESETS.find((p) => p.id === selected)?.label}
              />
              <div className="space-y-4 p-5">
                <div className="grid gap-4 sm:grid-cols-[auto_1fr_1fr_1fr]">
                  <Field label="Channel">
                    <div className="flex h-9 rounded-lg border border-line-strong bg-surface p-0.5">
                      {CHANNELS.map(({ value, icon: Icon }) => (
                        <button
                          type="button"
                          key={value}
                          title={channelName(value)}
                          aria-label={channelName(value)}
                          aria-pressed={form.channel === value}
                          onClick={() => {
                            setForm({ ...form, channel: value });
                            setSelected("custom");
                          }}
                          className={`flex items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors ${
                            form.channel === value ? "bg-ink text-white" : "text-muted hover:text-ink"
                          }`}
                        >
                          <Icon className="size-3.5" />
                          {form.channel === value && channelName(value)}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Customer ID">
                    <input value={form.customer_id} onChange={set("customer_id")} className={`${fieldCls} font-mono !text-[13px]`} />
                  </Field>
                  <Field label="Order ID">
                    <input value={form.order_id} onChange={set("order_id")} className={`${fieldCls} font-mono !text-[13px]`} />
                  </Field>
                  <Field label="Thread ID">
                    <input value={form.thread_id} onChange={set("thread_id")} className={`${fieldCls} font-mono !text-[13px]`} />
                  </Field>
                </div>
                <Field label="Customer message">
                  <textarea
                    required
                    value={form.text}
                    onChange={set("text")}
                    rows={3}
                    maxLength={4000}
                    className={`${fieldCls} h-auto resize-y py-2.5 text-[14.5px] leading-relaxed`}
                  />
                </Field>
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] text-faint">
                    Runs against live order data and the configured LLM provider.
                  </span>
                  <Button type="submit" variant="primary" icon={Send} loading={loading} className="h-10 px-5">
                    {loading ? "Running…" : "Run pipeline"}
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          <div ref={resultRef} className="scroll-mt-6">
            {loading && <RunningPanel />}
            {error && <ErrorState>{error}</ErrorState>}
            {result && !loading && <ResultPanel result={result} channel={sentChannel} />}
          </div>
        </div>
      </div>
    </>
  );
}
