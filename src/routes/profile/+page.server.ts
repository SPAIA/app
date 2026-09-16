import type { PageServerLoad } from './$types';
import { getProfile, upsertProfile } from '$lib/server/db/profiles';
import { getUserCollection } from '$lib/server/db/sightings';
import { getUserSessions, claimSessionsByEmail } from '$lib/server/db/sessions';
import { getSpotsByOwner } from '$lib/server/db/spots';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) return { profile: null, collection: [], sessions: [], spots: [] };

	const user = locals.user;
	if (!user) return { profile: null, collection: [], sessions: [], spots: [] };

	// Magic-link callbacks land here — pull in any sessions observed before
	// sign-in that were tagged with this user's email.
	if (user.email) await claimSessionsByEmail(db, user.email, user.id);

	let profile = await getProfile(db, user.id);
	if (!profile) {
		await upsertProfile(db, user.id, { display_name: user.email?.split('@')[0] ?? null });
		profile = await getProfile(db, user.id);
	}

	const [collection, sessions, spots] = await Promise.all([
		getUserCollection(db, user.id),
		getUserSessions(db, user.id),
		getSpotsByOwner(db, user.id)
	]);

	return { profile, collection, sessions, spots };
};
