-- Remove the XP gamification fields; levels are now derived retrospectively
ALTER TABLE insect_types DROP COLUMN xp_value;
ALTER TABLE profiles DROP COLUMN xp_total;
ALTER TABLE sessions DROP COLUMN xp_earned;
