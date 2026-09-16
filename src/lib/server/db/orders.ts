import type { SpaceOrder, RedeemCode, RedeemCodeScope } from '$lib/types';
import type { D1Database } from './d1';

export async function createSpaceOrder(
	db: D1Database,
	orderId: string,
	userId: string
): Promise<void> {
	await db
		.prepare(`
			INSERT INTO space_orders (id, user_id, stripe_status)
			VALUES (?, ?, 'pending')
		`)
		.bind(orderId, userId)
		.run();
}

export async function getSpaceOrder(db: D1Database, orderId: string): Promise<SpaceOrder | null> {
	return db
		.prepare('SELECT * FROM space_orders WHERE id = ?')
		.bind(orderId)
		.first<SpaceOrder>();
}

export async function updateSpaceOrderStatus(
	db: D1Database,
	orderId: string,
	status: 'pending' | 'paid' | 'failed'
): Promise<void> {
	await db
		.prepare('UPDATE space_orders SET stripe_status = ? WHERE id = ?')
		.bind(status, orderId)
		.run();
}

export async function updateSpaceOrderSpaceId(
	db: D1Database,
	orderId: string,
	spaceId: number
): Promise<void> {
	await db
		.prepare('UPDATE space_orders SET space_id = ? WHERE id = ?')
		.bind(spaceId, orderId)
		.run();
}

/** Redeem code plus per-row validity flags computed in SQL against datetime('now'). */
type RedeemCodeCheck = RedeemCode & { not_yet_valid: number; expired: number };

export async function getRedeemCode(db: D1Database, code: string): Promise<RedeemCodeCheck | null> {
	return db
		.prepare(`
			SELECT *,
				(datetime('now') < datetime(valid_from)) as not_yet_valid,
				(valid_until IS NOT NULL AND datetime('now') > datetime(valid_until)) as expired
			FROM redeem_codes
			WHERE UPPER(code) = UPPER(?)
		`)
		.bind(code.trim())
		.first<RedeemCodeCheck>();
}

export async function countRedeemCodeUses(db: D1Database, codeId: number): Promise<number> {
	const row = await db
		.prepare('SELECT COUNT(*) as count FROM redeem_code_uses WHERE code_id = ?')
		.bind(codeId)
		.first<{ count: number }>();
	return row?.count ?? 0;
}

export async function recordRedeemCodeUse(
	db: D1Database,
	codeId: number,
	userId: string,
	spaceOrderId: string | null
): Promise<void> {
	await db
		.prepare('INSERT INTO redeem_code_uses (code_id, user_id, space_order_id) VALUES (?, ?, ?)')
		.bind(codeId, userId, spaceOrderId)
		.run();
}

/**
 * Validates a redeem code for the given scope and user, recording the
 * redemption if it's valid. `scope` filters to codes issued for that entity
 * type ('any'-scoped codes always match).
 */
export async function redeemCode(
	db: D1Database,
	code: string,
	scope: Exclude<RedeemCodeScope, 'any'>,
	userId: string,
	spaceOrderId: string | null
): Promise<{ ok: true } | { ok: false; error: 'not_found' | 'inactive' | 'not_yet_valid' | 'expired' | 'max_uses' }> {
	const record = await getRedeemCode(db, code);
	if (!record || (record.scope !== scope && record.scope !== 'any')) return { ok: false, error: 'not_found' };
	if (!record.active) return { ok: false, error: 'inactive' };
	if (record.not_yet_valid) return { ok: false, error: 'not_yet_valid' };
	if (record.expired) return { ok: false, error: 'expired' };

	const uses = await countRedeemCodeUses(db, record.id);
	if (uses >= record.max_uses) return { ok: false, error: 'max_uses' };

	await recordRedeemCodeUse(db, record.id, userId, spaceOrderId);
	return { ok: true };
}
