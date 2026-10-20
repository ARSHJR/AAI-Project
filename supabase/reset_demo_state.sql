-- ============================================================================
-- reset_demo_state.sql
-- Returns the database to a clean PRE-DEMO state.
--
-- Run in the Supabase SQL editor (or `psql`). Safe to run repeatedly.
--
-- DELETES (transient data produced by running the support workflow):
--   contact_history, actions, escalations, ticket_events, audit_log, tickets
--
-- PRESERVES (baseline data, never touched):
--   customers, orders, order_items, shipment_events, payments, policies,
--   staff_profiles, and every Supabase Auth user (auth.users).
--
-- The application never UPDATEs seeded tables (orders / payments / policies /
-- customers are read-only to the workflow; refunds and credits are recorded as
-- rows in `actions`), so no baseline field needs restoring.
--
-- Everything runs in one transaction: if any statement fails or a safety check
-- trips, nothing is deleted.
-- ============================================================================

begin;

-- Safety check: refuse to run against a database that has no baseline data
-- (wrong project, or seed script not run yet).
do $$
begin
  if (select count(*) from public.orders)   = 0
  or (select count(*) from public.policies) = 0
  or (select count(*) from public.customers) = 0 then
    raise exception 'Baseline data missing (orders/policies/customers empty). Run `python -m seed.seed_data` first; nothing was deleted.';
  end if;
end $$;

-- Delete children before parents (foreign keys point at tickets).
delete from public.contact_history;   -- repeat-contact memory (-> tickets, customers, orders)
delete from public.actions;           -- refunds / credits / returns (-> tickets, orders, policies)
delete from public.escalations;       -- human-review handoffs (-> tickets)
delete from public.ticket_events;     -- per-step pipeline trail (-> tickets)
delete from public.audit_log;         -- audit trail, including rows with no ticket
delete from public.tickets;           -- the tickets themselves

-- Verification: transient tables must be empty, baseline tables must be intact.
do $$
declare
  leftover bigint;
begin
  select (select count(*) from public.tickets)
       + (select count(*) from public.ticket_events)
       + (select count(*) from public.actions)
       + (select count(*) from public.escalations)
       + (select count(*) from public.audit_log)
       + (select count(*) from public.contact_history)
    into leftover;
  if leftover <> 0 then
    raise exception 'Reset incomplete: % transient rows remain; rolled back.', leftover;
  end if;
end $$;

commit;

-- Result: row counts after reset (transient = 0, baseline unchanged).
select 'tickets' as table_name, 'transient' as kind, count(*) as rows from public.tickets
union all select 'ticket_events',   'transient', count(*) from public.ticket_events
union all select 'actions',         'transient', count(*) from public.actions
union all select 'escalations',     'transient', count(*) from public.escalations
union all select 'audit_log',       'transient', count(*) from public.audit_log
union all select 'contact_history', 'transient', count(*) from public.contact_history
union all select 'customers',       'baseline',  count(*) from public.customers
union all select 'orders',          'baseline',  count(*) from public.orders
union all select 'order_items',     'baseline',  count(*) from public.order_items
union all select 'shipment_events', 'baseline',  count(*) from public.shipment_events
union all select 'payments',        'baseline',  count(*) from public.payments
union all select 'policies',        'baseline',  count(*) from public.policies
union all select 'staff_profiles',  'baseline',  count(*) from public.staff_profiles
order by kind desc, table_name;
