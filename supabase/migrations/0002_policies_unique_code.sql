-- Fixes a gap in the original 0001_init.sql: the seed script upserts
-- policies on_conflict "code", which requires a unique constraint. Run this
-- ONLY if you applied 0001_init.sql before this fix landed (0001 now
-- creates the constraint inline for fresh installs - running this against
-- a fresh install will error "constraint already exists", which is fine,
-- just skip it in that case).
alter table policies add constraint policies_code_key unique (code);
