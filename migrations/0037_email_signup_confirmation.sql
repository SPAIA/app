-- Double opt-in for email_signups: a row only counts once its owner has
-- clicked the link in the confirmation email (confirmed_at set). The token is
-- regenerated on each re-submit of an unconfirmed address, so only the most
-- recent email's link works.
ALTER TABLE email_signups ADD COLUMN confirm_token TEXT;
ALTER TABLE email_signups ADD COLUMN confirmed_at TEXT;

CREATE UNIQUE INDEX idx_email_signups_confirm_token ON email_signups(confirm_token);
