import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, FileCheck2, Languages, ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Button, Field, fieldCls } from "../components/ui";

const POINTS = [
  { icon: Languages, text: "Understands English, Hindi and Marathi — including Romanized, code-mixed text" },
  { icon: Search, text: "Retrieves live order and shipment facts before it decides anything" },
  { icon: FileCheck2, text: "Applies versioned policies deterministically; the LLM never moves money" },
  { icon: ShieldCheck, text: "Escalates what it cannot safely handle, with a full audit trail" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not sign in. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="hidden flex-col justify-between bg-nav p-12 text-nav-text lg:flex">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-9 rounded-lg" />
          <span className="text-[15px] font-semibold text-white">Order Support Copilot</span>
        </div>
        <div>
          <h2 className="max-w-md text-[30px] font-semibold leading-tight tracking-tight text-white">
            Resolve order issues end to end — and show your work.
          </h2>
          <ul className="mt-8 max-w-md space-y-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3 text-[14px] leading-snug">
                <Icon className="mt-0.5 size-[18px] shrink-0 text-[#7ea3ff]" strokeWidth={1.8} />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="text-[12px] text-nav-text/60">
          Understand → Retrieve → Reason → Decide → Act → Verify → Respond
        </div>
      </div>

      <div className="flex items-center justify-center bg-canvas px-6">
        <form onSubmit={onSubmit} className="w-full max-w-[360px]">
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Sign in</h1>
          <p className="mb-7 mt-1 text-[14px] text-muted">Support operations console for agents and supervisors.</p>
          <div className="space-y-4">
            <Field label="Email">
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldCls}
                placeholder="you@company.com"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldCls}
                placeholder="••••••••"
              />
            </Field>
            {error && (
              <div role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">
                {error}
              </div>
            )}
            <Button type="submit" variant="primary" loading={loading} className="h-10 w-full">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
