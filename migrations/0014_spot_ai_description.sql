-- Spots created through the new "add a spot" flow get an AI-generated read of
-- the scene (plants, groundcover, a short description) from the DeepSeek
-- Vision call made against the spot's photo. Stored as a JSON string.
ALTER TABLE spots ADD COLUMN ai_description TEXT;
