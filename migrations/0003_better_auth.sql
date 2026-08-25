-- Better Auth core tables (replaces Supabase auth.users).
-- Schema mirrors better-auth getAuthTables() for the sqlite dialect:
--   string -> text, boolean -> integer, date -> date, id -> text.
-- Plugins in use (magicLink, bearer, emailAndPassword) add no extra tables;
-- magic-link tokens live in the `verification` table.

CREATE TABLE user (
  id            text PRIMARY KEY NOT NULL,
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  emailVerified integer NOT NULL DEFAULT 0,
  image         text,
  createdAt     date NOT NULL,
  updatedAt     date NOT NULL
);

CREATE TABLE session (
  id        text PRIMARY KEY NOT NULL,
  expiresAt date NOT NULL,
  token     text NOT NULL UNIQUE,
  createdAt date NOT NULL,
  updatedAt date NOT NULL,
  ipAddress text,
  userAgent text,
  userId    text NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX idx_session_user ON session(userId);

CREATE TABLE account (
  id                    text PRIMARY KEY NOT NULL,
  accountId             text NOT NULL,
  providerId            text NOT NULL,
  userId                text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken           text,
  refreshToken          text,
  idToken               text,
  accessTokenExpiresAt  date,
  refreshTokenExpiresAt date,
  scope                 text,
  password              text,
  createdAt             date NOT NULL,
  updatedAt             date NOT NULL
);
CREATE INDEX idx_account_user ON account(userId);

CREATE TABLE verification (
  id         text PRIMARY KEY NOT NULL,
  identifier text NOT NULL,
  value      text NOT NULL,
  expiresAt  date NOT NULL,
  createdAt  date NOT NULL,
  updatedAt  date NOT NULL
);
CREATE INDEX idx_verification_identifier ON verification(identifier);
