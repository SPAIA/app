-- Free-text fallback for when an observer skips the observation photo —
-- DeepSeek Vision can no longer read the scene, so we ask by hand instead.
ALTER TABLE sessions ADD COLUMN condition TEXT;
