-- What kind of place someone said matters to them on /ort (garten, balkon,
-- schulhof, innenhof, anderer — see $lib/placeTypes). Recorded on the spot
-- they then create, and on the email signup when they ask for a link instead.
ALTER TABLE spots ADD COLUMN place_type TEXT;
ALTER TABLE email_signups ADD COLUMN place_type TEXT;
