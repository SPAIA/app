-- last_active_at: server time of the most recent accepted sync. The client
-- syncs every 30s while its count timer runs, so for a count whose device
-- died or was closed before completing, this marks roughly when observing
-- stopped. completeExpiredSessions ends such a count here rather than at its
-- planned end, so an abandoned count isn't credited with minutes nobody
-- observed. NULL for sessions synced before this column existed.
ALTER TABLE sessions ADD COLUMN last_active_at TEXT;
