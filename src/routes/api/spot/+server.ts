import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSpot, getSpaceOrder, getSpotByOrderId, getSpotBySlug } from '$lib/db/queries';
import { uniqueSlug } from '$lib/slug';

interface CreateSpotBody {
	space_id: number;
	lat: number;
	lng: number;
	/** A paid/redeemed space_orders id — required, minted via /spot-pack -> /spot/new. */
	order_id: string;
}

// Create a spot as soon as its location is set — before a photo or name exist yet.
//
// Minting a new spot always requires a paid/redeemed order (see /spot-pack):
// the order must be paid, belong to the caller, and not already have minted a
// spot — the resulting spot is then owned by that user. Attaching an
// observation session to an *existing* spot stays free and needs no order.
export const POST: RequestHandler = async ({ request, locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) return json({ error: 'Database unavailable' }, { status: 503 });

	const body = (await request.json()) as Partial<CreateSpotBody>;
	const { space_id, lat, lng, order_id } = body;

	if (!Number.isFinite(space_id) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
		return json({ error: 'space_id, lat and lng are required' }, { status: 400 });
	}
	if (!order_id) return json({ error: 'order_id is required' }, { status: 400 });

	const user = locals.user;
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const order = await getSpaceOrder(db, order_id);
	if (!order) return json({ error: 'Order not found' }, { status: 404 });
	if (order.stripe_status !== 'paid') return json({ error: 'Order not paid' }, { status: 402 });
	if (order.user_id !== user.id) return json({ error: 'Forbidden' }, { status: 403 });

	const existingSpot = await getSpotByOrderId(db, order_id);
	if (existingSpot) return json({ error: 'A spot was already created for this order' }, { status: 409 });

	const ownerId = user.id;

	const slug = await uniqueSlug('spot', (candidate) => getSpotBySlug(db, candidate).then((s) => s !== null));

	const id = await createSpot(db, {
		space_id: space_id as number,
		slug,
		name: 'New spot',
		icon: '📍',
		lat: lat as number,
		lng: lng as number,
		owner_id: ownerId,
		order_id: order_id ?? null
	});

	return json({ id, slug });
};
