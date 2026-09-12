import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createSpace,
	createSpot,
	getAllSpaces,
	getSpaceBySlug,
	getSpaceOrder,
	getSpotByOrderId,
	getSpotBySlug,
	type D1Database
} from '$lib/db/queries';
import { findContainingSpace } from '$lib/geo';
import { uniqueSlug } from '$lib/slug';

interface CreateSpotBody {
	lat: number;
	lng: number;
	/** A paid/redeemed space_orders id — required, minted via /spot-pack -> /spot/new. */
	order_id: string;
	/** Reverse-geocoded from the spot's position; used only if a new space needs creating. */
	locality?: string | null;
	country?: string | null;
	town?: string | null;
	region?: string | null;
	postcode?: string | null;
	countryGeonameId?: number | null;
	regionGeonameId?: number | null;
	townGeonameId?: number | null;
	localityGeonameId?: number | null;
}

/**
 * Finds the space whose drawn boundary contains this point, or creates a new
 * (unowned, boundary-less) space there using the reverse-geocoded position —
 * spaces get merged/absorbed into each other by hand once their boundaries exist.
 */
async function resolveSpace(
	db: D1Database,
	lat: number,
	lng: number,
	geo: Pick<
		CreateSpotBody,
		| 'locality'
		| 'country'
		| 'town'
		| 'region'
		| 'postcode'
		| 'countryGeonameId'
		| 'regionGeonameId'
		| 'townGeonameId'
		| 'localityGeonameId'
	>
): Promise<{ id: number; slug: string }> {
	const spaces = await getAllSpaces(db);
	const containing = findContainingSpace(spaces, lat, lng);
	if (containing) return { id: containing.id, slug: containing.slug };

	const name = geo.town || geo.locality || 'New space';
	const slug = await uniqueSlug(name, (candidate) => getSpaceBySlug(db, candidate).then((s) => s !== null));

	const id = await createSpace(db, {
		slug,
		name,
		locality: geo.locality || '',
		country: geo.country ?? null,
		town: geo.town ?? null,
		region: geo.region ?? null,
		postcode: geo.postcode ?? null,
		country_geoname_id: geo.countryGeonameId ?? null,
		region_geoname_id: geo.regionGeonameId ?? null,
		town_geoname_id: geo.townGeonameId ?? null,
		locality_geoname_id: geo.localityGeonameId ?? null,
		icon: '🌿',
		lat,
		lng,
		owner_id: null,
		boundary_geojson: null
	});

	return { id, slug };
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
	const { lat, lng, order_id } = body;

	if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
		return json({ error: 'lat and lng are required' }, { status: 400 });
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

	const space = await resolveSpace(db, lat as number, lng as number, body);

	const slug = await uniqueSlug('spot', (candidate) => getSpotBySlug(db, candidate).then((s) => s !== null));

	const id = await createSpot(db, {
		space_id: space.id,
		slug,
		name: 'New spot',
		icon: '📍',
		lat: lat as number,
		lng: lng as number,
		owner_id: ownerId,
		order_id: order_id ?? null
	});

	return json({ id, slug, space_slug: space.slug });
};
