import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Stripe from 'stripe';
import { createSpaceOrder } from '$lib/db/queries';

export const POST: RequestHandler = async ({ request, url, locals, platform }) => {
	const env = platform?.env;

	if (!env?.STRIPE_SECRET_KEY) {
		return json({ error: 'Stripe not configured' }, { status: 503 });
	}

	// Where to send the user back to if they abandon checkout — defaults to
	// /space-pack, but /spot-pack passes its own path so cancelling lands them
	// back on the right pack page.
	const { cancelPath: rawCancelPath } = (await request.json().catch(() => ({}))) as { cancelPath?: string };
	const cancelPath = rawCancelPath?.startsWith('/') && !rawCancelPath.startsWith('//') ? rawCancelPath : '/space-pack';

	const stripe = new Stripe(env.STRIPE_SECRET_KEY);
	const userId = locals.user?.id ?? `anon:${crypto.randomUUID()}`;

	const orderId = crypto.randomUUID();

	const session = await stripe.checkout.sessions.create({
		mode: 'payment',
		// STRIPE_PRICE_ID must reference a "customer chooses price" Price
		// (custom_unit_amount enabled) for pay-what-you-want to work.
		line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
		success_url: `${url.origin}/spot/new?order={CHECKOUT_SESSION_ID}`,
		cancel_url: `${url.origin}${cancelPath}`,
		metadata: { orderId, userId }
	});

	if (env.DB) {
		await createSpaceOrder(env.DB, session.id, userId);
	}

	return json({ url: session.url });
};
