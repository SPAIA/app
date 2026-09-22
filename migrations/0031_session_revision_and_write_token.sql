-- Hardens PUT /api/sessions/[id] (see syncSessionSnapshot):
--
-- 1. revision: a monotonically increasing counter the client bumps on every
--    local state change. Lets the server reject an out-of-order sync
--    outright instead of trusting arrival order — without this, a delayed
--    in-progress snapshot could land after a completion and null out
--    completed_at, or otherwise regress a session to older field values.
--
-- 2. write_token: a per-session credential minted client-side at session
--    start. Session ids are exposed publicly via /share/[sessionId], so the
--    id alone must not double as a write credential for anonymous sessions —
--    only the holder of the matching write_token (or, once claimed, the
--    owning signed-in user) may sync further updates to a given session.
ALTER TABLE sessions ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN write_token TEXT;
