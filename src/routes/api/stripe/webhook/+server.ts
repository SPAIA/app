import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Stripe from 'stripe';
import { getSpaceOrder, updateSpaceOrderStatus } from '$lib/server/db/orders';
import type { D1Database } from '$lib/server/db/d1';

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env as {
		STRIPE_SECRET_KEY: string;
		STRIPE_WEBHOOK_SECRET: string;
		DB: D1Database;
	} | undefined;

	if (!env?.STRIPE_SECRET_KEY) {
		return json({ error: 'Stripe not configured' }, { status: 503 });
	}

	const stripe = new Stripe(env.STRIPE_SECRET_KEY);
	const body = await request.text();
	const sig = request.headers.get('stripe-signature');

	if (!sig || !env.STRIPE_WEBHOOK_SECRET) {
		return json({ error: 'Missing signature' }, { status: 400 });
	}

	let event: Stripe.Event;
	try {
		event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET);
	} catch {
		return json({ error: 'Invalid signature' }, { status: 400 });
	}

	if (event.type === 'checkout.session.completed') {
		const session = event.data.object as Stripe.Checkout.Session;

		if (env.DB) {
			const existing = await getSpaceOrder(env.DB, session.id);
			if (existing && existing.stripe_status !== 'paid') {
				await updateSpaceOrderStatus(env.DB, session.id, 'paid');
			}
		}
	}

	return json({ received: true });
};
