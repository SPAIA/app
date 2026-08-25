import type { PageServerLoad } from './$types';
import {
	getProfile,
	upsertProfile,
	getUserCollection,
	getUserSessions,
	claimSessionsByEmail,
	getSpacesByOwner,
	getSpotsBySpace
} from '$lib/db/queries';
import type { Space, Spot } from '$lib/types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) return { profile: null, collection: [], sessions: [], ownedSpaces: [] };

	const user = locals.user;
	if (!user) return { profile: null, collection: [], sessions: [], ownedSpaces: [] };

	// Magic-link callbacks land here — pull in any sessions observed before
	// sign-in that were tagged with this user's email.
	if (user.email) await claimSessionsByEmail(db, user.email, user.id);

	let profile = await getProfile(db, user.id);
	if (!profile) {
		await upsertProfile(db, user.id, { display_name: user.email?.split('@')[0] ?? null });
		profile = await getProfile(db, user.id);
	}

	const [collection, sessions, spaces] = await Promise.all([
		getUserCollection(db, user.id),
		getUserSessions(db, user.id),
		getSpacesByOwner(db, user.id)
	]);

	const ownedSpaces: Array<{ space: Space; spots: Spot[] }> = await Promise.all(
		spaces.map(async (space) => ({ space, spots: await getSpotsBySpace(db, space.id) }))
	);

	return { profile, collection, sessions, ownedSpaces };
};
