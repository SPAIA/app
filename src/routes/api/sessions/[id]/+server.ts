import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncSessionSnapshot } from '$lib/server/db/sessions';
import { SessionSnapshotSchema } from '$lib/session/snapshot';

/**
 * Idempotent replacement sync for one observation: makes the persisted
 * session match the given SessionSnapshot exactly, whether this is the
 * first sync, a routine 30s heartbeat, the final completion, or a retry of
 * any of those. See syncSessionSnapshot for how repeats stay safe.
 */
export const PUT: RequestHandler = async ({ params, request, platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) return json({ error: 'Database unavailable' }, { status: 503 });

	const parsed = SessionSnapshotSchema.safeParse(await request.json());
	if (!parsed.success || parsed.data.id !== params.id) {
		return json({ error: 'Invalid snapshot' }, { status: 400 });
	}

	// Own the session straight away: the signed-in user if there is one,
	// otherwise an anonymous owner. Anonymous sessions can later be claimed by
	// email (see /api/sessions/claim) or, once the observer signs in on any
	// page, automatically (see /api/sessions/claim-local).
	const userId = locals.user?.id ?? `anon:${crypto.randomUUID()}`;

	await syncSessionSnapshot(db, parsed.data, userId);

	return json({ ok: true });
};
