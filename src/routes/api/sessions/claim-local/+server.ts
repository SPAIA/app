import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { claimSessionsByIds } from '$lib/db/queries';

interface ClaimLocalBody {
	sessionIds: string[];
}

/**
 * Reassigns anon-owned sessions this browser recorded (tracked in
 * localStorage, see $lib/localSessions) to the now-signed-in user. Runs on
 * every authenticated page load (see +layout.svelte) — separate from the
 * email-claim flow, since it links whatever this device has done regardless
 * of which session an email was typed into.
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) return json({ error: 'Not authenticated' }, { status: 401 });

	const env = platform?.env;
	const db = env?.DB;
	if (!db) return json({ error: 'Database unavailable' }, { status: 503 });

	const { sessionIds } = (await request.json()) as ClaimLocalBody;
	if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
		return json({ ok: true });
	}

	await claimSessionsByIds(db, sessionIds, locals.user.id);

	return json({ ok: true });
};
