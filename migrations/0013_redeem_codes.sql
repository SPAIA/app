-- Promo/partner codes that unlock free space or spot creation without
-- payment. Each code has a validity window and a cap on total redemptions;
-- every redemption is logged so usage can be audited and so the same user
-- can't reuse one code to grab multiple free spaces.
CREATE TABLE redeem_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  scope       TEXT NOT NULL DEFAULT 'space' CHECK (scope IN ('space', 'spot', 'any')),
  max_uses    INTEGER NOT NULL DEFAULT 1,
  valid_from  TEXT NOT NULL DEFAULT (datetime('now')),
  valid_until TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  note        TEXT,
  created_by  TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE redeem_code_uses (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id        INTEGER NOT NULL REFERENCES redeem_codes(id),
  user_id        TEXT NOT NULL,
  space_order_id TEXT REFERENCES space_orders(id),
  used_at        TEXT DEFAULT (datetime('now')),
  UNIQUE(code_id, user_id)
);

CREATE INDEX idx_redeem_code_uses_code ON redeem_code_uses(code_id);
