# Multilingual Order Support Copilot — Project Guide

A complete walkthrough of what this project is, how it is built, how to demo it, and how to reset it between runs.
Everything here was checked against the code in this repository; where behaviour depends on the LLM or on the date, it says so.

**Contents**

1. [What the project is](#1-what-the-project-is)
2. [Architecture at a glance](#2-architecture-at-a-glance)
3. [The agentic pipeline, step by step](#3-the-agentic-pipeline-step-by-step)
4. [Decision rules (the part that moves money)](#4-decision-rules-the-part-that-moves-money)
5. [Data model](#5-data-model)
6. [Backend implementation](#6-backend-implementation)
7. [API reference](#7-api-reference)
8. [Authentication and roles](#8-authentication-and-roles)
9. [Frontend implementation](#9-frontend-implementation)
10. [Safeguards: why this is not "a chatbot"](#10-safeguards-why-this-is-not-a-chatbot)
11. [Testing](#11-testing)
12. [Running the project](#12-running-the-project)
13. [Demo script (step by step)](#13-demo-script-step-by-step)
14. [Resetting between demos](#14-resetting-between-demos)
15. [Troubleshooting during a demo](#15-troubleshooting-during-a-demo)
16. [Known limitations (be upfront about these)](#16-known-limitations-be-upfront-about-these)
17. [Likely viva questions](#17-likely-viva-questions)

---

## 1. What the project is

**Problem (PS-14):** E-commerce support teams receive order questions on chat, email and WhatsApp, in English, Hindi and Marathi
(often Romanized or mixed: "Mera order 3 din se late hai"). Most are routine (where is my order, refund for a wrong item, return
this). A few are risky (₹18,400 refund, an order that doesn't exist, the same complaint for the third time).

**Solution:** an autonomous support agent that, for every incoming message:

> **understand → retrieve → reason → decide → act → verify → respond**

1. understands the language and what the customer wants,
2. retrieves the real order, items and shipment events from the database,
3. matches the situation against versioned support policies,
4. decides what to do using deterministic rules,
5. executes the action (delay credit, refund, return) or escalates to a human,
6. verifies the result, and
7. replies in the customer's own language, recording every step in an audit trail.

**Why it is "agentic" and not a chatbot.** A chatbot does `message → LLM → reply`. Here the LLM is used only for language
understanding and reply wording. Facts come from the database, eligibility comes from code, and actions are idempotent writes. The
LLM is never asked "should we refund?".

**Users of the dashboard:** support agents, supervisors (can retry tickets), and admins. They monitor tickets, review
escalations, inspect policies and audit the decision trail.

---

## 2. Architecture at a glance

```
 Channels (chat / email / WhatsApp)          ← simulated by POST /tickets
            │
            ▼
 FastAPI backend ── ingest_message (dedup, create ticket)
            │
            ▼
 LangGraph state machine (9 nodes) ─────────► Groq / Gemini LLM
            │                                   (language fallback, intent, reply only)
            ▼
 Supabase Postgres  (orders, policies, tickets, events, actions, escalations, audit…)
            ▲
            │  REST (JWT)
 React dashboard (Vite + Tailwind)  ← staff sign in via Supabase Auth
```

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4, React Router, Axios, Lucide icons |
| Backend | Python, FastAPI, Pydantic |
| Orchestration | LangGraph `StateGraph` |
| Database + Auth | Supabase (Postgres, Row Level Security, Supabase Auth) |
| LLM | Groq (default) or Gemini, switchable with `LLM_PROVIDER` |
| Tests | pytest with an in-memory fake Supabase client (no network) |
| Packaging | Dockerfiles + `docker-compose.yml` |

Repository layout:

```
backend/app/agents/    graph.py (wiring), nodes.py (the 9 nodes), state.py (shared state)
backend/app/services/  ticket, order, policy, action, contact, language, llm services
backend/app/api/       auth, tickets, dashboard, policies routers
backend/app/core/      config (env settings), security (JWT + roles)
backend/seed/          seed_data.py (demo customers, orders, policies)
backend/tests/         49 tests + fake Supabase fixture
frontend/src/          pages/, components/ (Layout, StatusChip, ui), lib/ (api, auth, format)
supabase/migrations/   0001_init.sql, 0002, 0003
supabase/reset_demo_state.sql   ← demo reset script
docs/PROJECT_GUIDE.md  ← this file
```

---

## 3. The agentic pipeline, step by step

Defined in `backend/app/agents/graph.py`; each node is in `nodes.py`. Each node appends an event to the state, and all events are
saved to `ticket_events` and `audit_log` when the run ends.

```
detect_language → classify_intent → identify_and_retrieve → match_policy
   → check_repeat_contact → decide_action ──┬─ (not escalation) → execute_action ─┬─ ok → draft_response → END
                                            │                                      └─ failed ─┐
                                            └─ (escalation) ───────────────────────────────► escalate → draft_response → END
```

| # | Node | What it does | LLM? |
|---|---|---|---|
| 0 | **Ingestion** (`ticket_service.ingest_message`) | Creates the ticket. Drops a duplicate (same channel + thread + text) arriving within **30 s**. | No |
| 1 | `detect_language` | Detects English / Hindi / Marathi and script (native vs romanized). Fast heuristics first (Devanagari characters, marker words like *hai, mera, aahe, mala*); the LLM is asked only when the text is ambiguous or code-mixed. If the LLM fails, it falls back to the heuristic. | Fallback only |
| 2 | `classify_intent` | One primary intent from `order_tracking, delivery_delay, refund, wrong_item, return, other`, plus a confidence and any secondary intents. On LLM failure: intent `other`, confidence 0, which forces escalation. | **Yes** |
| 3 | `identify_and_retrieve` | Looks up the customer and the order (items, shipment events, ETA, delay hours). Retries a failed lookup once; "not found" is recorded as a fact rather than an exception. | No |
| 4 | `match_policy` | Picks the active policy for the intent's category and evaluates its machine-checkable `conditions` against the order. Returns `{policy, eligible, reason}`. | No |
| 5 | `check_repeat_contact` | Counts the customer's *unresolved* earlier contacts for this order (+1 for the current message). At 3 or more, it forces escalation. | No |
| 6 | `decide_action` | Rule cascade (see section 4) → one of `reply_only, delay_credit, refund, return_initiation, escalation`. | No |
| 7 | `execute_action` | Writes the action with an **idempotency key** and returns a reference such as `CR-…`, `RF-…` or `RT-…`. Failure routes to escalation rather than pretending success. | No |
| 8 | `escalate` | Builds the human handoff: reasons, urgency, and a full summary of intent, language, customer, order and policy match. | No |
| 9 | `draft_response` | Writes the customer reply in the detected language and script, in a tone suited to the channel, from grounding facts only. If the LLM is unavailable, a deterministic template is used. | **Yes** (with fallback) |

After the graph finishes, `resolve_ticket` writes the ticket row (status, intent, action, response, resolution time), stores events
and audit rows, creates the escalation row if escalated, and records the contact in `contact_history`. A concrete remedy (credit,
refund, return) marks that contact *resolved*; an informational `reply_only` does **not**, so a customer who keeps chasing the same
stuck order still trips the repeat-contact threshold. This was a bug found in live testing and is covered by
`test_repeat_contact_regression.py`.

---

## 4. Decision rules (the part that moves money)

`decision_node` evaluates these **in order**; the first match wins. Thresholds come from `backend/.env` (defaults shown).

| Order | Condition | Decision | Basis recorded |
|---|---|---|---|
| 1 | Customer or order not found | **escalation** | `customer_or_order_not_found` |
| 2 | ≥ 3 unresolved contacts on this order (`REPEAT_CONTACT_ESCALATION_THRESHOLD=3`) | **escalation** | `repeat_unresolved_contact` |
| 3 | Intent confidence < `0.75` (`INTENT_CONFIDENCE_AUTO_THRESHOLD`) | **escalation** | `low_intent_confidence` |
| 4 | Secondary intent conflicts with the primary (tracking + refund, for example) | **escalation** | `multi_intent_conflict` |
| 5 | Intent `order_tracking` | **reply_only** | `informational_tracking_reply` |
| 6 | Intent `delivery_delay`: order is more than 48 h past ETA (Policy 6.1) | **delay_credit** (₹100) | policy reason |
| 6b | Intent `delivery_delay`: not delayed enough or order cancelled | **reply_only** | policy reason |
| 7 | Intent `refund` / `wrong_item`: order value ≤ ₹3,000 (Policies 4.2 / 4.3) | **refund** (full order value) | policy reason |
| 7b | Same, but value above ₹3,000 | **escalation** | "exceeds auto-approve cap…" |
| 8 | Intent `return` (Policy 5.1) | **return_initiation** | policy reason |
| 9 | Anything else (`other`) | **escalation** | `unsupported_or_ambiguous_intent` |

Compatible secondary intents do not count as conflicts: `order_tracking` ≈ `delivery_delay`, and `refund` ≈ `wrong_item` ≈
`damaged_item`.

Escalation urgency is **high** when the order value is above ₹3,000 or the repeat-contact threshold fired, otherwise **medium**.

### Seeded policies

| Code | Title | Rule |
|---|---|---|
| 4.2 | Standard Refund Eligibility | auto-approve up to ₹3,000 |
| 4.3 | Wrong Item Received | auto-approve up to ₹3,000 |
| 4.4 | Damaged Item on Arrival | auto-approve up to ₹3,000 |
| 5.1 | Return Window | 10 days from delivery |
| 6.1 | Delivery Delay Compensation | delay > 48 h past ETA |
| 7.1 | High-Value Transaction Review | above ₹3,000 → human |
| 8.1 | Escalation Conditions | low confidence, conflicts, unknown order, 3+ repeats |
| 9.1 | Cancelled Order Claims | no delay compensation for orders cancelled before dispatch |

---

## 5. Data model

Defined in `supabase/migrations/0001_init.sql` (0002 adds a unique constraint on `policies.code`; 0003 removes foreign keys on
`tickets.customer_id/order_id` so a typo'd order number is *discovered by the agent and escalated* instead of rejected by the DB).

**Baseline (seeded, never modified by the workflow)**

| Table | Purpose |
|---|---|
| `customers` | 6 demo customers with preferred language |
| `orders`, `order_items` | 8 orders with value, status, ETA, carrier, delivered date |
| `shipment_events` | tracking history (pickup, hub delay, exception, delivered…) |
| `payments` | one UPI payment per order |
| `policies` | 8 versioned policies; `conditions` is JSON, with `version`, `is_active`, `effective_from`, `superseded_by` and a reserved `embedding vector(768)` |
| `staff_profiles` | role (`agent` / `supervisor` / `admin`) tied to a Supabase Auth user |

**Transient (created by running the workflow, cleared by the reset script)**

| Table | Purpose |
|---|---|
| `tickets` | unified cross-channel ticket: message, language, intent, confidence, status, action, response, resolution time |
| `ticket_events` | one row per pipeline step with its JSON payload (this feeds the Ticket Detail trail) |
| `actions` | executed refund / credit / return with reference and a **unique `idempotency_key`** (`{ticket_id}:{action_type}`) |
| `escalations` | human handoff queue with a JSON context summary, urgency and status |
| `audit_log` | flat event stream for compliance and CSV export |
| `contact_history` | repeat-contact memory per customer + order |

Seed timestamps are generated **relative to the moment you run the seed** (`now - 3 days`, and so on), which matters for demos (see
section 14).

Seeded demo orders:

| Order | Customer | Situation |
|---|---|---|
| IN48213 | C-7719 Priya Sharma | in transit, ETA 3 days ago, ₹1,299 |
| IN51092 | C-5502 Rahul Verma | in transit, on time, ₹2,499 |
| IN33087 | C-3381 Sneha Kulkarni | delivered 6 days ago, ₹899 |
| IN22456 | C-3381 Sneha Kulkarni | delivered 2 days ago, ₹1,599 |
| IN77001 | C-9120 Amit Joshi | delivered, **₹18,400** TV |
| IN60099 | C-4456 Fatima Khan | **cancelled** before dispatch, ₹749 |
| IN68211 | C-6671 Deepak Nair | in transit, ETA 4 days ago, address exception, ₹1,099 |
| IN90555 | C-6671 Deepak Nair | processing, just placed, ₹599 |
| IN00000 | — | deliberately **not** seeded (order-not-found scenario) |

---

## 6. Backend implementation

| File | Responsibility |
|---|---|
| `main.py` | FastAPI app, CORS (only `FRONTEND_ORIGIN`), routers, `/health` |
| `core/config.py` | `pydantic-settings` reading `backend/.env`: Supabase keys, LLM provider, business thresholds |
| `core/security.py` | validates the Supabase JWT, loads the staff profile, `require_role()` |
| `db/supabase_client.py` | anon client (verify tokens) and service-role client (data access) |
| `services/ticket_service.py` | ingestion + dedup, runs the graph, persists everything, escalation rows, contact history |
| `services/order_service.py` | customer/order lookup, computes `is_delayed` and `delay_hours` from the ETA |
| `services/policy_service.py` | deterministic eligibility per policy category |
| `services/action_service.py` | idempotent action execution with reference IDs |
| `services/contact_service.py` | repeat-contact counting |
| `services/language_service.py` | heuristic + LLM language detection |
| `services/llm_service.py` | Groq/Gemini wrapper: JSON mode, 20 s timeout, one retry, `LLMError` on bad output |

Design choices worth mentioning:

- **LLM isolation.** One function (`call_structured_llm`) is the only door to the model, so every node has a defined failure
  path (heuristic, template, or escalate).
- **Service-role key stays server-side.** The browser never touches the database; it talks to FastAPI with the user's JWT.
- **Everything is replayable.** Each step's payload is stored as JSON, so the UI can show exactly what the agent saw.
- **Live testing found five bugs** (commit `e927799`; see `git show e927799`). Two are described in this guide: the
  repeat-contact reset bug and the ticket foreign keys that blocked the "order not found" scenario (migrations 0002 and 0003).
  The commit also added regression tests for the decision and response paths.

---

## 7. API reference

All routes except login need `Authorization: Bearer <Supabase access token>`.

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/health` | none | shows whether Supabase and the LLM are configured |
| POST | `/auth/login` | none | email + password → token, name, role |
| GET | `/auth/me` | any staff | current user |
| POST | `/tickets` | any staff | **ingest + resolve** a message synchronously (used by Simulate) |
| GET | `/tickets` | any staff | list; filters `status`, `channel`, `limit` |
| GET | `/tickets/{id}` | any staff | ticket + `events` + `actions` + `escalation` |
| POST | `/tickets/{id}/retry` | supervisor+ | re-run the pipeline (actions stay idempotent) |
| GET | `/dashboard/metrics` | any staff | totals, rate, average time, distributions |
| GET | `/dashboard/escalations` | any staff | escalations joined with their ticket |
| GET | `/dashboard/audit` | any staff | audit log (`limit`, `ticket_id`) |
| GET | `/policies` | any staff | active policies |

Request body for `POST /tickets`:
`{ channel: "chat|email|whatsapp", thread_id, text, customer_id?, order_id? }`.
Interactive docs: `http://localhost:8000/docs`.

---

## 8. Authentication and roles

- Staff accounts live in **Supabase Auth**. There is no hard-coded demo login.
- A staff member also needs a row in `staff_profiles` (id = auth user id, name, role). Without it they get a 403.
- Roles: `agent` < `supervisor` < `admin`. Only **supervisor and above** can use *Retry pipeline*.
- Access tokens last about **1 hour**. After that the frontend's Axios interceptor clears the session and redirects to the login page.

---

## 9. Frontend implementation

Plain React with no global state library. `lib/auth.jsx` holds the session (persisted in `localStorage`), and `lib/api.js` wraps
Axios (adds the token, redirects on 401, and retries a failed GET once to ride out transient connection blips).

Design language: dark ink sidebar, neutral canvas, one blue accent; green / amber / red are reserved for outcomes. Inter for text
and JetBrains Mono for IDs and references. No gradients or glow. Shared pieces are in `components/ui.jsx` (cards, buttons, fields,
skeletons, empty and error states) and `lib/format.js` (labels, dates, currency).

| Route | Page | What it shows |
|---|---|---|
| `/login` | Login | split-screen sign-in |
| `/` | **Overview** | KPI strip (total, auto-resolution rate, escalated, average time), stacked outcome bar, ranked bars for actions, intent, language and channel, latest activity |
| `/simulate` | **Simulate Message** | 8 scenario cards, editable channel/customer/order/thread/message, live "pipeline running" stepper, result card (outcome banner, language, intent, policy, action and reference, reply bubble), link to the trail |
| `/tickets` | **Tickets** | status tabs, channel filter, search, dense table with confidence, order, outcome, timestamps |
| `/tickets/:id` | **Ticket Detail** | outcome banner → *Customer wrote / Copilot replied* → **Evidence → Rule → Decision → Action** strip → **10-step pipeline trail** with expandable facts and raw payloads |
| `/escalations` | **Escalations** | per case: what the system found, why it could not proceed, reviewer next steps (tabs for open / in review / resolved) |
| `/policies` | **Policies** | table: code, category, criteria, outcome, version, effective date, status |
| `/audit` | **Audit History** | timestamp, ticket, event, component, outcome, reference; search, event filter, CSV export |

The 10 steps on Ticket Detail are derived from the real `ticket_events`, `actions` and `escalation` records: message received →
language → intent → customer/order identified → order and shipment facts → policy matched → decision → action or escalation →
result verified → reply drafted. Nothing on screen is mocked; "Reviewer next steps" on Escalations is guidance text keyed off the
reason the pipeline recorded.

---

## 10. Safeguards: why this is not "a chatbot"

| Safeguard | Where |
|---|---|
| Money decisions are deterministic code; the LLM never decides eligibility | `policy_service.py`, `decision_node` |
| Idempotent actions: unique `idempotency_key` means retries and duplicate webhooks cannot refund twice | `action_service.py` |
| Confidence gate: below 0.75 always escalates | `decision_node` |
| Conflicting intents escalate instead of guessing | `_has_conflicting_multi_intent` |
| Repeat-contact memory: 3 unresolved contacts escalate even if the message looks routine | `contact_service.py` |
| High-value cap: above ₹3,000 needs a human | Policies 4.x and 7.1 |
| Grounded replies: the prompt contains only retrieved facts, with a template fallback | `response_node` |
| Failure handling: one order-lookup retry, one LLM retry, execution failure → escalation (never a false "done") | `identify_and_retrieve_node`, `route_after_execution` |
| Message dedup (30 s) | `ticket_service.py` |
| Role-based access, RLS on every table, service key backend-only | `security.py`, migration 0001 |
| Full audit trail, exportable | `audit_log`, Audit History page |

---

## 11. Testing

```bash
cd backend
source .venv/Scripts/activate
python -m pytest -q          # 49 passed
```

Covers policy eligibility, idempotent actions, language heuristics, every escalation trigger, order retrieval and delay flags,
dedup, repeat-contact thresholds, API auth (401 / 403), and two full graph runs. The LLM is mocked and the database is an in-memory
fake, so tests need no network.

Frontend: `npm run build` (production build) and `npm run lint`.

---

## 12. Running the project

**One-time setup** (details in `README.md`): create the Supabase project, run `supabase/migrations/0001_init.sql`, create two Auth
users (agent and supervisor) and insert their `staff_profiles` rows, fill `backend/.env` (Supabase URL and keys, `GROQ_API_KEY`),
then `frontend/.env` with `VITE_API_BASE_URL=http://localhost:8000`. Seed the demo data:

```bash
cd backend && source .venv/Scripts/activate
python -m seed.seed_data
```

**Every time** (two terminals, Git Bash from the project root):

```bash
# Terminal 1: backend
cd backend
source .venv/Scripts/activate
uvicorn app.main:app --reload          # check http://localhost:8000/health

# Terminal 2: frontend
cd frontend
npm run dev                            # open http://localhost:5173
```

Docker alternative: `docker compose up --build` (needs a root `.env`).

---

## 13. Demo script (step by step)

**Total time ≈ 10–12 minutes.** Do the preparation first, and rehearse once.

### Before the demo (15 minutes ahead)

1. Start both servers (section 12). Open `http://localhost:8000/health`; both `supabase_configured` and `llm_configured` should be `true`.
2. If the seed data is more than a few days old, refresh it: `python -m seed.seed_data` (section 14).
3. **Run the reset script** (section 14) so the dashboard starts empty.
4. Sign in as the **supervisor** (so *Retry pipeline* is visible). Tokens expire after an hour, so sign in shortly before you start.
5. Confirm Overview shows **"No tickets processed yet"**.
6. Use a full-screen browser at normal zoom. Close other tabs.

### The walkthrough

**1. Frame it (30 s) — Overview, empty state.**
"This is a support operations console. The agent behind it handles order messages in English, Hindi and Marathi and either
resolves them or hands them to a human. Right now it's empty, so everything you see comes from live runs."

**2. Simulate Message: the happy path (2 min).**
- Select **Delayed delivery (Hinglish)** (WhatsApp, Priya, order IN48213, "Mera order 3 din se late hai, kab aayega?"). Click **Run pipeline**.
- Narrate the stepper as it runs: language, intent, retrieve order, match policy, decide, act and draft.
- On the result card point out: *Auto-resolved*, language **Hindi (romanized)**, intent **Delivery delay**, policy **6.1**,
  action **Delay credit ₹100** with a `CR-…` reference, and the **reply in Hindi**.
- "The reply is generated, but the *credit* was decided by a rule: the order is more than 48 hours past its ETA."

**3. Ticket Detail: the money shot (1–2 min).** Click **Open pipeline trail**.
- Top banner: resolved automatically, language, intent, time.
- **Evidence → Rule → Decision → Action** strip: "Order facts → Policy 6.1 → Delay credit → ₹100 with reference. Evidence, rule,
  decision, action. That chain is what makes it an agent rather than a chatbot."
- Click **Expand all** and scroll the 10 steps: message received, language, intent, customer and order, shipment facts (hub delay
  event), policy conditions, decision basis ("Deterministic rules, not the LLM"), action reference, verification, drafted reply.
- Open **View raw event payload** on one step: "Every step is stored as JSON, so every decision can be replayed."

**4. More scenarios (3 min).** Back on Simulate, run these and say one line for each:
- **Order tracking (English)**, order IN51092: informational reply, no action.
- **Wrong item, wants refund** (IN33087, ₹899): auto-refund `RF-…` under the ₹3,000 cap.
- **Return request (Marathi)**: Marathi reply, return initiated.
- **High-value refund** (IN77001, ₹18,400): **escalates**. "Policy cap is ₹3,000, so it will never move money without a human."
- **Order not found** (IN00000): **escalates** because evidence is missing.

**5. Escalations (1 min).** Open **Escalations** (the sidebar shows the open count). Show the high-value case: *What the system
found*, *Why it could not proceed*, *Reviewer next steps*. "The human doesn't start from zero."

**6. Overview again (45 s).** Now it has data: auto-resolution rate, escalated count, average resolution time, and the language,
intent, channel and action breakdowns.

**7. Tickets, Policies, Audit (1.5 min).**
- **Tickets:** search for `IN77001`, filter *Escalated*, click a row.
- **Policies:** "Every automated action traces back to one of these versioned rules."
- **Audit History:** filter by event, then **Export CSV**.

**8. Safety demos (1.5 min), pick two or three.**
- **Dedup:** run the *same* scenario twice within 30 seconds. The second shows *"Duplicate message ignored"*.
- **Idempotency:** open a resolved ticket and click **Retry pipeline** (supervisor only). Open the ticket again and check **no
  second credit or refund** was created (still one action).
- **Role control:** (optional) sign in as the agent and show that *Retry pipeline* is not available.

**9. Close (30 s).** "Understand, retrieve, reason, decide, act, verify, respond, with deterministic guardrails around any
action that touches money and a full audit trail."

### Scenario cheat sheet

| Scenario | Customer / order | Expected result | Policy |
|---|---|---|---|
| Delayed delivery (Hinglish) | C-7719 / IN48213 | auto-resolved, delay credit ₹100, Hindi reply | 6.1 |
| Order tracking (English) | C-5502 / IN51092 | auto-resolved, reply only | none |
| Wrong item, wants refund | C-3381 / IN33087 | auto-resolved, refund ₹899 | 4.3 |
| Return request (Marathi) | C-3381 / IN22456 | auto-resolved, return initiated | 5.1 |
| High-value refund | C-9120 / IN77001 | **escalated** (₹18,400 above cap) | 4.2 / 7.1 |
| Order not found | C-6671 / IN00000 | **escalated** (order not found) | none |
| Delay claim on cancelled order | C-4456 / IN60099 | **see note below** | 9.1 |
| Repeat contact | C-6671 / IN68211 | **see note below** | 8.1 |

> **Rehearse the last two before the viva.** Their outcome depends on how the LLM classifies the message, and I have not
> verified them end to end. A cancelled order is never "delayed" in code, so a message classified as *delivery delay* gets a plain
> informational reply, not an escalation. Repeat-contact only escalates once the customer has **3 unresolved contacts on that
> order**, and a delay credit marks a contact resolved, which resets the count. If you want to show repeat-contact reliably, send
> *tracking-style* messages ("any update on my order?") for IN68211 three times, 30+ seconds apart, and rehearse that exact flow.
> Don't promise either outcome out loud until you've seen it work.

> Also remember the LLM (Groq) has some variability. A scenario can occasionally be classified differently. Running every
> scenario once during rehearsal is the best protection.

---

## 14. Resetting between demos

### What gets created by demos and rehearsals

Every run inserts rows into `tickets`, `ticket_events`, `audit_log`, `contact_history`, and, depending on the outcome, `actions`
and `escalations`. Two of these affect later behaviour, not just the dashboard:

- **`contact_history`** drives repeat-contact escalation. Leftover rows from rehearsal can make a *fresh* demo scenario escalate
  unexpectedly (for example, running order tracking for the same order several times across sessions).
- **`actions`** hold idempotency keys. They are keyed by ticket ID, so they won't block new tickets, but old refunds and credits
  would clutter the story.

### What to run

**Before every demo and after every rehearsal:** run `supabase/reset_demo_state.sql`.

1. Supabase dashboard → **SQL Editor** → **New query**.
2. Paste the contents of `supabase/reset_demo_state.sql` and click **Run**.
3. Check the result grid: all six *transient* tables should show `0`, and the *baseline* tables should show
   `customers 6, orders 8, order_items 8, shipment_events 12, payments 8, policies 8, staff_profiles 2`.
4. Refresh the dashboard. Overview shows the empty state.

The script runs in a single transaction. It refuses to run if baseline data is missing, deletes children before parents
(`contact_history → actions → escalations → ticket_events → audit_log → tickets`), and self-checks that the transient tables are
empty before committing. It is safe to run repeatedly. It **never touches** Supabase Auth users, `staff_profiles`, customers,
orders, items, shipments, payments or policies.

I ran it against the live project: baseline checksums were identical before and after, and a re-run of a scenario followed by a
second reset returned to a clean state.

### What the reset does *not* do

| Not handled | What to do |
|---|---|
| **Seed date drift.** Order dates were set relative to the day you seeded. After a week the "delivered 2 days ago" order is delivered 9 days ago. Delays still exceed 48 h, but anything "recent" ages. | Run `python -m seed.seed_data` the day before the demo. It re-upserts customers and orders and rebuilds items, shipments and payments with fresh dates. It is safe to run on top of existing data. |
| **Expired login token** (about 1 hour) | Sign in again right before you start. |
| **Browser state** | Not stored in the DB. A hard refresh is enough. |
| **Dedup window** (30 s) | Nothing to reset; it is in-memory logic against recent tickets. Wait 30 s between identical messages. |

### Checklist: day before / just before

- [ ] `python -m seed.seed_data` (refreshes dates)
- [ ] Rehearse all 8 scenarios once
- [ ] Run `reset_demo_state.sql`
- [ ] `/health` shows Supabase and LLM configured
- [ ] Log in as supervisor; Overview is empty
- [ ] Internet works (Supabase and Groq are cloud services)

---

## 15. Troubleshooting during a demo

| Symptom | Likely cause | Fix |
|---|---|---|
| Redirected to login, or 401 errors | Token expired (1 h) | Sign in again |
| "Could not load…" once, then fine | Transient connection drop to Supabase | The app retries GETs once; click Refresh or Retry |
| Reply looks generic or templated | LLM unavailable or rate-limited; fallback template used | Normal and safe; the decision logic is unaffected. Retry in a minute |
| Pipeline takes 5+ s | LLM latency | Expected range is 2–3 s; keep talking through the stepper |
| Second run shows "Duplicate message ignored" | Same message and thread within 30 s | Wait, or edit the message / thread ID |
| A scenario escalates unexpectedly | Leftover `contact_history` (repeat-contact) | Run the reset script |
| Blank dashboard but tickets exist | Backend not running or `VITE_API_BASE_URL` wrong | Check `/health` and `frontend/.env` |
| `Retry pipeline` missing | Signed in as agent | Sign in as the supervisor |

---

## 16. Known limitations (be upfront about these)

- **Channels are simulated.** WhatsApp, email and chat arrive through one normalized `POST /tickets`. Real webhooks would call the
  same `ingest_message`.
- **Synchronous processing.** The request waits for the whole pipeline (fine for a demo; production would queue it).
- **Return policy is simple.** It returns "eligible" when the customer asks for a return; the 10-day window is displayed and
  configured but the code does not currently compare it to the delivery date.
- **Policy retrieval is rule-based.** The `embedding` column exists for future semantic FAQ matching but is unused.
- **No policy-version diffing job**, though `version` and `superseded_by` are in the schema.
- **Simulated back-office systems.** Refunds and credits are recorded rows with generated references, not real payment calls.
- **Frontend has no automated tests**; it was verified manually and via build and lint.

---

## 17. Likely viva questions

**Why not just use an LLM for everything?** Money decisions must be auditable and reproducible. The LLM handles ambiguity in
language; code handles policy. A wrong refund is expensive, a wrong adjective is not.

**What stops a double refund?** The unique `idempotency_key` (`ticket_id:action_type`) on `actions`. Retry the same ticket and
the existing action is returned (`duplicate: true`). Tests prove it.

**What if the LLM is down or returns garbage?** Language falls back to heuristics, intent becomes `other` with confidence 0
(which escalates), and the reply uses a deterministic template. The system degrades toward *more* human involvement, never toward
unsafe automation.

**How does it handle Hinglish / Marathi?** Heuristics catch Devanagari and common Romanized marker words quickly; the LLM
resolves ambiguous or code-mixed text; the reply is written in the same language and script.

**How do you know it's right?** 49 automated tests; the stored per-step payloads let anyone replay a decision; and live
end-to-end testing against real Supabase and Groq found and fixed five bugs.

**How would this scale?** Put ingestion on a queue with workers, add real channel webhooks, populate policy embeddings for FAQ
retrieval, and add proactive delay notifications.

**Who can do what?** Any staff can view and simulate; only supervisors and above can retry tickets. The service-role database
key never leaves the backend.
