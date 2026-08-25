import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMediaForEntity, getSpotById, getSpotSummary } from '$lib/db/queries';

// Stats + cover image for a spot's map card: observation count, last-observed
// date, and the most-counted insects there.
export const GET: RequestHandler = async ({ params, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');

	const spotId = Number(params.id);
	if (!Number.isFinite(spotId)) throw error(400, 'Invalid spot id');

	const spot = await getSpotById(db, spotId);
	if (!spot) throw error(404, 'Spot not found');

	const [summary, media] = await Promise.all([
		getSpotSummary(db, spotId),
		getMediaForEntity(db, 'spot', String(spotId))
	]);
	const cover = media.find((m) => m.media_type === 'header_image') ?? null;

	return json({ ...summary, cover: cover ? { id: cover.id } : null });
};
