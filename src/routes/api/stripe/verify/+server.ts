import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Stripe from 'stripe';
import { getSpaceOrder, updateSpaceOrderStatus } from '$lib/db/queries';
import type { D1Database } from '$lib/db/queries';

export const GET: RequestHandler = async ({ url, platform }) => {
	const env = platform?.env as { STRIPE_SECRET_KEY: string; DB: D1Database } | undefined;

	if (!env?.STRIPE_SECRET_KEY) {
		return json({ error: 'Stripe not configured' }, { status: 503 });
	}

	const sessionId = url.searchParams.get('session_id');
	if (!sessionId) return json({ error: 'Missing session_id' }, { status: 400 });

	const stripe = new Stripe(env.STRIPE_SECRET_KEY);

	try {
		const session = await stripe.checkout.sessions.retrieve(sessionId);
		const paid = session.payment_status === 'paid';

		const order = env.DB ? await getSpaceOrder(env.DB, sessionId) : null;

		// Persist the paid status so /api/space/create doesn't depend on the
		// webhook having fired. Stripe is the source of truth here.
		if (paid && env.DB && order && order.stripe_status !== 'paid') {
			await updateSpaceOrderStatus(env.DB, sessionId, 'paid');
		}

		return json({ paid, spaceOrderId: order?.id ?? sessionId });
	} catch {
		// Not a real Stripe session id — may be a locally-created order from the
		// skip-payment bypass. Fall back to our own record of its paid status.
		const order = env.DB ? await getSpaceOrder(env.DB, sessionId) : null;
		return json({ paid: order?.stripe_status === 'paid', spaceOrderId: order?.id ?? null });
	}
};
