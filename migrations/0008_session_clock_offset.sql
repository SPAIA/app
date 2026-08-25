-- The phone aligns its clock to server (NTP-disciplined UTC) time before a
-- session so taps line up with the NTP-synced site camera. We store the offset
-- that was applied (server − device, ms) as provenance: it shows how far the
-- device clock was off and therefore how much to trust the alignment.
ALTER TABLE sessions ADD COLUMN clock_offset_ms INTEGER;
