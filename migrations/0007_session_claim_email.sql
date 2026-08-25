-- Anonymous sessions are saved immediately on completion under an `anon:*`
-- owner id. When the observer later provides an email, we stamp the session
-- with `claim_email`; once they verify the magic link, the session is
-- reassigned to their real user id (see claimSessionsByEmail).
ALTER TABLE sessions ADD COLUMN claim_email TEXT;
CREATE INDEX idx_sessions_claim_email ON sessions(claim_email);
