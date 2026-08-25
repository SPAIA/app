import type { PageServerLoad } from './$types';
import { getSpaceBySlug, getSpaceSessions, getMediaForEntity } from '$lib/db/queries';
import { error, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');

	const user = locals.user;
	if (!user) throw redirect(303, '/auth/login');

	const space = await getSpaceBySlug(db, params.slug);
	if (!space) throw error(404, 'Space not found');
	if (space.owner_id !== user.id) throw error(403, 'Forbidden');

	const sessions = await getSpaceSessions(db, space.id);

	const totalSightings = sessions.reduce((sum, s) => sum + s.total_count, 0);
	const uniqueObservers = new Set(sessions.map((s) => s.user_id)).size;

	const media = await getMediaForEntity(db, 'space', String(space.id));
	const cover = media.find((m) => m.media_type === 'header_image') ?? null;

	return { space, sessions, totalSightings, uniqueObservers, cover };
};
