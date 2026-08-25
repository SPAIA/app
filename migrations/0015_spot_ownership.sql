-- Spots become the paid/redeemable product for now (Spaces get reworked with
-- map-boundary drawing later) — a purchased spot needs an owner, and its
-- order needs tracking so a paid/redeemed order can't mint more than one.
ALTER TABLE spots ADD COLUMN owner_id TEXT;
ALTER TABLE spots ADD COLUMN order_id TEXT REFERENCES space_orders(id);
