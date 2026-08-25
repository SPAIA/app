import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllSpaces } from '$lib/db/queries';
import type { D1Database } from '$lib/db/queries';
import { findNearestSpace } from '$lib/geo';

export const GET: RequestHandler = async ({ url, platform }) => {
	const db = platform?.env?.DB as D1Database | undefined;
	if (!db) return json({ error: 'Database unavailable' }, { status: 503 });

	const lat = Number(url.searchParams.get('lat'));
	const lng = Number(url.searchParams.get('lng'));
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
		return json({ error: 'lat and lng query params are required' }, { status: 400 });
	}

	const spaces = await getAllSpaces(db);
	const nearest = findNearestSpace(spaces, lat, lng);
	if (!nearest) return json({ space: null, distanceKm: null });

	return json({ space: nearest.space, distanceKm: nearest.distanceKm });
};
