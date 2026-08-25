import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSpaceOrder, updateSpaceOrderStatus, redeemCode } from '$lib/db/queries';

const REDEEM_ERROR_MESSAGES: Record<string, string> = {
	not_found: 'Code not recognized',
	inactive: 'Code is no longer active',
	not_yet_valid: 'Code is not active yet',
	expired: 'Code has expired',
	max_uses: 'Code has reached its usage limit'
};

/**
 * Creates a space_orders row marked paid without going through Stripe, gated
 * on a valid 'spot'-scoped redeem code, so /spot-pack -> /spot/new -> /api/spot
 * can proceed unchanged.
 */
export const POST: RequestHandler = async ({ request, locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) return json({ error: 'Database unavailable' }, { status: 503 });

	const user = locals.user;
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = (await request.json().catch(() => ({}))) as { code?: string };
	const code = body.code?.trim();
	if (!code) return json({ error: 'Code is required' }, { status: 400 });

	const orderId = crypto.randomUUID();
	await createSpaceOrder(db, orderId, user.id);

	const result = await redeemCode(db, code, 'spot', user.id, orderId);
	if (!result.ok) {
		const status = result.error === 'not_found' ? 404 : result.error === 'max_uses' ? 409 : 403;
		return json({ error: REDEEM_ERROR_MESSAGES[result.error] }, { status });
	}

	await updateSpaceOrderStatus(db, orderId, 'paid');

	return json({ orderId });
};
