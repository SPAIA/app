import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSpaceBySlug, getSpaceLiveData } from '$lib/db/queries';
import type { D1Database } from '$lib/db/queries';
import type { LiveSpaceData } from '$lib/types';

export const GET: RequestHandler = async ({ params, platform, setHeaders }) => {
	const db = platform?.env?.DB as D1Database | undefined;
	if (!db) return json({ error: 'Database unavailable' }, { status: 503 });

	const space = await getSpaceBySlug(db, params.slug);
	if (!space) return json({ error: 'Space not found' }, { status: 404 });

	const live = await getSpaceLiveData(db, space.id);

	setHeaders({
		'Cache-Control': 'public, max-age=900' // 15 min cache for live space stats
	});

	const response: LiveSpaceData = {
		spaceName: space.name,
		totalThisWeek: live.totalThisWeek,
		lastInsect: live.lastInsect,
		lastSeenAt: live.lastSeenAt
	};

	return json(response);
};
