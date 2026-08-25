-- A code should be redeemable more than once by the same user (e.g. a
-- partner code used to create several free spaces/spots). Drop the
-- one-use-per-user constraint; max_uses remains the only cap, enforced
-- against the total redemption count.
CREATE TABLE redeem_code_uses_new (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id        INTEGER NOT NULL REFERENCES redeem_codes(id),
  user_id        TEXT NOT NULL,
  space_order_id TEXT REFERENCES space_orders(id),
  used_at        TEXT DEFAULT (datetime('now'))
);

INSERT INTO redeem_code_uses_new (id, code_id, user_id, space_order_id, used_at)
SELECT id, code_id, user_id, space_order_id, used_at FROM redeem_code_uses;

DROP TABLE redeem_code_uses;
ALTER TABLE redeem_code_uses_new RENAME TO redeem_code_uses;

CREATE INDEX idx_redeem_code_uses_code ON redeem_code_uses(code_id);
