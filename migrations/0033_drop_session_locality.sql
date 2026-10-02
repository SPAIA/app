-- sessions.locality was copied from the spot's space when the count started,
-- so it went stale if the space's locality was later corrected. Every read
-- now joins spaces via space_id for the live value (as 0028 did for names).
ALTER TABLE sessions DROP COLUMN locality;
