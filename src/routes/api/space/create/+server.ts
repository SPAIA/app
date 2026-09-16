import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSpace } from '$lib/server/db/spaces';
import { getSpaceOrder, updateSpaceOrderSpaceId } from '$lib/server/db/orders';

interface CreateSpaceBody {
	spaceName: string;
	spaceOrderId: string;
	description?: string | null;
	lat?: number | null;
	lng?: number | null;
	/** GeoJSON Polygon/MultiPolygon geometry (as a JSON string) traced on the map, if any. */
	boundaryGeojson?: string | null;
}

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) return json({ error: 'Database unavailable' }, { status: 503 });

	const user = locals.user;
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = (await request.json()) as CreateSpaceBody;
	const { spaceName, spaceOrderId, description, lat, lng, boundaryGeojson } = body;

	if (!spaceName || !spaceOrderId) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	if (boundaryGeojson) {
		try {
			const geom = JSON.parse(boundaryGeojson);
			if (geom?.type !== 'Polygon' && geom?.type !== 'MultiPolygon') {
				return json({ error: 'Invalid boundary' }, { status: 400 });
			}
		} catch {
			return json({ error: 'Invalid boundary' }, { status: 400 });
		}
	}

	const order = await getSpaceOrder(db, spaceOrderId);
	if (!order) return json({ error: 'Order not found' }, { status: 404 });
	if (order.stripe_status !== 'paid') return json({ error: 'Order not paid' }, { status: 402 });
	if (order.user_id !== user.id) return json({ error: 'Forbidden' }, { status: 403 });
	if (order.space_id) return json({ error: 'Space already created for this order' }, { status: 409 });

	const slug = spaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

	const spaceId = await createSpace(db, {
		slug,
		name: spaceName,
		description: description ?? null,
		locality: '',
		country: null,
		icon: '🌿',
		lat: lat ?? null,
		lng: lng ?? null,
		owner_id: user.id,
		boundary_geojson: boundaryGeojson ?? null
	});

	await updateSpaceOrderSpaceId(db, spaceOrderId, spaceId);

	return json({ slug });
};
