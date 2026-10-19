-- PS-14 Multilingual Order Support Copilot — initial schema
-- Run via Supabase SQL editor or `supabase db push`.

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ============================================================
-- Auth-adjacent: support staff profiles (roles on top of Supabase Auth users)
-- ============================================================
create table if not exists staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('agent', 'supervisor', 'admin')) default 'agent',
  created_at timestamptz not null default now()
);

-- ============================================================
-- E-commerce domain
-- ============================================================
create table if not exists customers (
  id text primary key, -- e.g. C-7719
  full_name text not null,
  phone text,
  email text,
  preferred_language text default 'en' check (preferred_language in ('en', 'hi', 'mr')),
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id text primary key, -- e.g. IN48213
  customer_id text not null references customers(id) on delete cascade,
  status text not null check (status in ('placed','processing','shipped','in_transit','out_for_delivery','delivered','cancelled','returned')),
  order_value numeric(10,2) not null,
  placed_at timestamptz not null,
  eta timestamptz not null,
  delivered_at timestamptz,
  carrier text,
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references orders(id) on delete cascade,
  sku text not null,
  name text not null,
  quantity int not null default 1,
  price numeric(10,2) not null,
  category text
);

create table if not exists shipment_events (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references orders(id) on delete cascade,
  event_type text not null, -- e.g. picked_up, in_transit, hub_delay, out_for_delivery, delivered, exception
  description text,
  location text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references orders(id) on delete cascade,
  method text not null,
  amount numeric(10,2) not null,
  status text not null check (status in ('paid','refunded','partial_refund','pending')) default 'paid',
  created_at timestamptz not null default now()
);

-- ============================================================
-- Support policies (versioned, embeddable for semantic retrieval)
-- ============================================================
create table if not exists policies (
  id uuid primary key default gen_random_uuid(),
  code text not null, -- e.g. "6.1"
  title text not null,
  category text not null check (category in (
    'delivery_delay','refund','return','wrong_item','damaged_item',
    'cancellation','high_value','escalation','general'
  )),
  body text not null,
  conditions jsonb not null default '{}', -- machine-checkable thresholds, e.g. {"delay_hours_gt": 48}
  version int not null default 1,
  is_active boolean not null default true,
  effective_from timestamptz not null default now(),
  superseded_by uuid references policies(id),
  embedding vector(768),
  created_at timestamptz not null default now()
);

create index if not exists idx_policies_category on policies(category) where is_active;

-- ============================================================
-- Tickets / conversation pipeline
-- ============================================================
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('chat','email','whatsapp')),
  thread_id text not null,
  customer_id text references customers(id),
  order_id text references orders(id),
  raw_message text not null,
  detected_language text, -- en / hi / mr
  script text, -- native / romanized
  normalized_text text,
  intent text,
  intent_confidence numeric(4,3),
  multi_intent jsonb default '[]',
  status text not null check (status in ('received','processing','auto_resolved','escalated','failed')) default 'received',
  action_taken text,
  escalation_reason text,
  urgency text check (urgency in ('low','medium','high','critical')),
  final_response text,
  resolution_time_ms int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tickets_customer on tickets(customer_id);
create index if not exists idx_tickets_order on tickets(order_id);
create index if not exists idx_tickets_thread on tickets(thread_id);
create index if not exists idx_tickets_status on tickets(status);

-- Message dedup support: same channel+thread+text within a short window
create index if not exists idx_tickets_dedup on tickets(thread_id, raw_message, created_at);

create table if not exists ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  step text not null, -- ingestion, language, intent, order_lookup, policy_match, decision, action, escalation, response
  payload jsonb not null default '{}',
  status text not null check (status in ('ok','retry','error')) default 'ok',
  created_at timestamptz not null default now()
);

create index if not exists idx_ticket_events_ticket on ticket_events(ticket_id);

create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  order_id text references orders(id),
  action_type text not null check (action_type in ('reply_only','refund','return_initiation','delay_credit','escalation')),
  amount numeric(10,2),
  status text not null check (status in ('pending','success','failed','rolled_back')) default 'pending',
  reference_id text, -- idempotency / external ref, e.g. CR-88213
  idempotency_key text unique,
  policy_id uuid references policies(id),
  reasoning jsonb default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_actions_ticket on actions(ticket_id);

create table if not exists escalations (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  reason text not null,
  urgency text not null check (urgency in ('low','medium','high','critical')),
  summary jsonb not null default '{}', -- full handoff context
  assigned_to uuid references staff_profiles(id),
  status text not null check (status in ('open','in_review','resolved')) default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_escalations_status on escalations(status);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references tickets(id) on delete cascade,
  actor text not null default 'system', -- system / agent name / staff id
  event_type text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_ticket on audit_log(ticket_id);

-- Repeat-contact memory: tracks unresolved contact count per customer+order
create table if not exists contact_history (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references customers(id) on delete cascade,
  order_id text references orders(id),
  ticket_id uuid references tickets(id),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_contact_history_customer_order on contact_history(customer_id, order_id);

-- ============================================================
-- updated_at trigger
-- ============================================================
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tickets_updated_at on tickets;
create trigger trg_tickets_updated_at before update on tickets
for each row execute function set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table tickets enable row level security;
alter table ticket_events enable row level security;
alter table actions enable row level security;
alter table escalations enable row level security;
alter table audit_log enable row level security;
alter table policies enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table shipment_events enable row level security;
alter table payments enable row level security;
alter table contact_history enable row level security;
alter table staff_profiles enable row level security;

-- All reads/writes from the app happen through the FastAPI backend using the
-- service_role key (bypasses RLS) after the backend authenticates the staff
-- member via Supabase Auth JWT and checks their role. RLS here is a defense
-- in depth layer for any direct client access (e.g. if Supabase client is
-- ever used from the frontend for read-only dashboards).
create policy staff_read_all_tickets on tickets for select
  using (auth.role() = 'authenticated');
create policy staff_read_all_events on ticket_events for select
  using (auth.role() = 'authenticated');
create policy staff_read_all_actions on actions for select
  using (auth.role() = 'authenticated');
create policy staff_read_all_escalations on escalations for select
  using (auth.role() = 'authenticated');
create policy staff_read_all_audit on audit_log for select
  using (auth.role() = 'authenticated');
create policy staff_read_all_policies on policies for select
  using (auth.role() = 'authenticated');
create policy staff_read_all_customers on customers for select
  using (auth.role() = 'authenticated');
create policy staff_read_all_orders on orders for select
  using (auth.role() = 'authenticated');
create policy staff_read_all_order_items on order_items for select
  using (auth.role() = 'authenticated');
create policy staff_read_all_shipment_events on shipment_events for select
  using (auth.role() = 'authenticated');
create policy staff_read_all_payments on payments for select
  using (auth.role() = 'authenticated');
create policy staff_read_all_contact_history on contact_history for select
  using (auth.role() = 'authenticated');
create policy staff_read_own_profile on staff_profiles for select
  using (auth.uid() = id or auth.role() = 'authenticated');
