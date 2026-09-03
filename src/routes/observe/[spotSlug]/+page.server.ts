import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getInsectTypes, getMediaForEntity, getSpotBySlug } from '$lib/db/queries';
import type { D1Database } from '$lib/db/queries';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = platform?.env?.DB as D1Database | undefined;
	if (!db) throw error(503, 'Database unavailable');

	const spot = await getSpotBySlug(db, params.spotSlug);
	if (!spot) throw error(404, 'Spot not found');

	const [insectTypes, media] = await Promise.all([
		getInsectTypes(db),
		getMediaForEntity(db, 'spot', String(spot.id))
	]);
	const cover = media.find((m) => m.media_type === 'header_image') ?? null;

	return { spot, insectTypes, cover: cover ? { id: cover.id } : null };
};
