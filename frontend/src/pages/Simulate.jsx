import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createTicket } from "../lib/api";

const PRESETS = [
  {
    label: "Hindi/Hinglish delayed delivery",
    channel: "whatsapp",
    customer_id: "C-7719",
    order_id: "IN48213",
    text: "Mera order 3 din se late hai, kab aayega?",
  },
  {
    label: "English order tracking",
    channel: "chat",
    customer_id: "C-5502",
    order_id: "IN51092",
    text: "Where is my order? It was supposed to arrive yesterday.",
  },
  {
    label: "Wrong item + refund",
    channel: "email",
    customer_id: "C-3381",
    order_id: "IN33087",
    text: "I received the wrong item in my order, I need a refund please.",
  },
  {
    label: "Marathi return request",
    channel: "whatsapp",
    customer_id: "C-3381",
    order_id: "IN22456",
    text: "Mala ha product return karaycha aahe, tyat problem aahe.",
  },
  {
    label: "High-value refund (escalates)",
    channel: "email",
    customer_id: "C-9120",
    order_id: "IN77001",
    text: "The TV I ordered arrived with a cracked screen, I want a full refund.",
  },
  {
    label: "Order not found",
    channel: "chat",
    customer_id: "C-6671",
    order_id: "IN00000",
    text: "Where is my order IN00000?",
  },
  {
    label: "Ambiguous / unsupported (cancelled order delay claim)",
    channel: "whatsapp",
    customer_id: "C-4456",
    order_id: "IN60099",
    text: "Mera order abhi tak nahi aaya, delay compensation chahiye.",
  },
  {
    label: "Repeat contact (unresolved)",
    channel: "whatsapp",
    customer_id: "C-6671",
    order_id: "IN68211",
    text: "Still no update on my order, this is the third time I'm asking!",
  },
];

export default function Simulate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    channel: "whatsapp",
    thread_id: "T-DEMO-1",
    customer_id: "C-7719",
    order_id: "IN48213",
    text: "Mera order 3 din se late hai, kab aayega?",
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function applyPreset(p) {
    setForm({
      channel: p.channel,
      thread_id: `T-DEMO-${p.order_id}`,
      customer_id: p.customer_id,
      order_id: p.order_id,
      text: p.text,
    });
    setResult(null);
    setError("");
  }

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await createTicket(form);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not process this message.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Simulate Incoming Message</h1>
        <p className="text-sm text-slate-500 mt-1">
          Drive a message through the full chat/email/WhatsApp adapter → agentic pipeline, live.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            className="text-xs font-medium px-3 py-1.5 rounded-full bg-white ring-1 ring-slate-200 hover:ring-indigo-300 text-slate-600"
          >
            {p.label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="bg-white rounded-xl ring-1 ring-slate-200 p-5 space-y-4">
        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500">Channel</label>
            <select
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="chat">Chat</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Thread ID</label>
            <input
              value={form.thread_id}
              onChange={(e) => setForm({ ...form, thread_id: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Customer ID</label>
            <input
              value={form.customer_id}
              onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Order ID</label>
            <input
              value={form.order_id}
              onChange={(e) => setForm({ ...form, order_id: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Message</label>
          <textarea
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-4 py-2 hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? "Processing through agent pipeline..." : "Send message"}
        </button>
      </form>

      {error && <div className="text-sm text-rose-600">{error}</div>}

      {result && (
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-5 space-y-3">
          <div className="text-sm font-semibold text-slate-800">Resolution Result</div>
          <div className="text-sm text-slate-700">{result.final_response}</div>
          <div className="text-xs text-slate-400">
            Status: {result.status} · Intent: {result.intent} · Decision: {result.decision}
          </div>
          <button
            onClick={() => navigate(`/tickets/${result.id || result.ticket_id}`)}
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            View full pipeline trail →
          </button>
        </div>
      )}
    </div>
  );
}
