import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSpotById, getSpotBySlug, renameSpot } from '$lib/db/queries';
import { uniqueSlug } from '$lib/slug';

interface RenameBody {
	name: string;
}

// Lets the user override the AI-suggested (or placeholder) name before confirming a spot.
export const PATCH: RequestHandler = async ({ params, request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');

	const spotId = Number(params.id);
	if (!Number.isFinite(spotId)) throw error(400, 'Invalid spot id');

	const spot = await getSpotById(db, spotId);
	if (!spot) throw error(404, 'Spot not found');

	const body = (await request.json()) as Partial<RenameBody>;
	const name = body.name?.trim();
	if (!name) throw error(400, 'name is required');

	const slug = await uniqueSlug(name, (candidate) =>
		candidate === spot.slug ? Promise.resolve(false) : getSpotBySlug(db, candidate).then((s) => s !== null)
	);

	await renameSpot(db, spot.id, name, slug);

	return json({ id: spot.id, slug, name });
};
