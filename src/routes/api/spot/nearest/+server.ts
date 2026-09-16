import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllSpots, getSpotsBySpace } from '$lib/server/db/spots';
import type { D1Database } from '$lib/server/db/d1';
import { findNearestSpot } from '$lib/geo';

export const GET: RequestHandler = async ({ url, platform }) => {
	const db = platform?.env?.DB as D1Database | undefined;
	if (!db) return json({ error: 'Database unavailable' }, { status: 503 });

	const lat = Number(url.searchParams.get('lat'));
	const lng = Number(url.searchParams.get('lng'));
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
		return json({ error: 'lat and lng query params are required' }, { status: 400 });
	}

	// Scoped to a space when given (the "are you at a spot you already have?"
	// check while adding a spot) — otherwise searches every spot everywhere.
	const spaceIdRaw = url.searchParams.get('space_id');
	const spaceId = spaceIdRaw ? Number(spaceIdRaw) : null;
	const spots = spaceId != null && Number.isFinite(spaceId) ? await getSpotsBySpace(db, spaceId) : await getAllSpots(db);
	const nearest = findNearestSpot(spots, lat, lng);
	if (!nearest) return json({ spot: null, distanceKm: null });

	return json({ spot: nearest.spot, distanceKm: nearest.distanceKm });
};
