-- Email addresses left on lightweight, no-account pages (e.g. the /naturlabor
-- demo: "we'll remind you to scan a place that matters to you"). source names
-- the page that collected it so later campaigns can be told apart; the same
-- address signing up twice from one source is kept as a single row.
CREATE TABLE email_signups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL,
  source      TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_email_signups_email_source ON email_signups(email, source);
