import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { claimFreeSpotOrder } from '$lib/server/db/orders';
import { isPlaceType } from '$lib/placeTypes';

// "Ort jetzt hinzufügen": sign up if needed, claim the account's one free
// spot, then hand over to the existing /spot/new placement flow. Once the free
// spot is used, further spots go through the normal /spot-pack purchase.
export const GET: RequestHandler = async ({ url, locals, platform }) => {
	const type = url.searchParams.get('type');
	const typeParam = isPlaceType(type) ? `&type=${type}` : '';

	if (!locals.user) {
		const next = `/ort/start${isPlaceType(type) ? `?type=${type}` : ''}`;
		throw redirect(303, `/auth/login?tab=signup&next=${encodeURIComponent(next)}`);
	}

	const db = platform?.env?.DB;
	if (!db) throw redirect(303, '/ort');

	const orderId = await claimFreeSpotOrder(db, locals.user.id);
	if (!orderId) throw redirect(303, '/spot-pack');

	throw redirect(303, `/spot/new?order=${encodeURIComponent(orderId)}${typeParam}`);
};
