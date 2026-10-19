-- Fixes a design bug in 0001_init.sql: tickets.customer_id/order_id had
-- foreign keys to customers/orders, which blocks the "order not found" /
-- "customer not found" demo scenarios at ingestion time with a DB error
-- instead of letting identify_and_retrieve_node discover and handle the
-- missing record gracefully. Run this if you already applied 0001_init.sql
-- before this fix landed (0001 now omits these FKs for fresh installs).
alter table tickets drop constraint if exists tickets_customer_id_fkey;
alter table tickets drop constraint if exists tickets_order_id_fkey;
