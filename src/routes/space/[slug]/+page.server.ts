import type { PageServerLoad } from './$types';
import { getSpaceBySlug, getSpaceLiveData, getMediaForEntity } from '$lib/db/queries';
import type { D1Database } from '$lib/db/queries';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = platform?.env?.DB as D1Database | undefined;
	if (!db) throw error(503, 'Database unavailable');

	const space = await getSpaceBySlug(db, params.slug);
	if (!space) throw error(404, 'Space not found');

	const live = await getSpaceLiveData(db, space.id);
	const media = await getMediaForEntity(db, 'space', String(space.id));
	const cover = media.find((m) => m.media_type === 'header_image') ?? null;

	return { space, live, cover };
};
