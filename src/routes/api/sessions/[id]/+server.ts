import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncSessionSnapshot, SessionWriteForbiddenError } from '$lib/server/db/sessions';
import { SessionSnapshotSchema } from '$lib/session/snapshot';

/**
 * Idempotent replacement sync for one observation: makes the persisted
 * session match the given SessionSnapshot exactly, whether this is the
 * first sync, a routine 30s heartbeat, the final completion, or a retry of
 * any of those. See syncSessionSnapshot for how repeats stay safe, and for
 * how ownership/write_token authorization works.
 */
export const PUT: RequestHandler = async ({ params, request, platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) return json({ error: 'Database unavailable' }, { status: 503 });

	const parsed = SessionSnapshotSchema.safeParse(await request.json());
	if (!parsed.success || parsed.data.id !== params.id) {
		return json({ error: 'Invalid snapshot' }, { status: 400 });
	}

	// A brand new session may be created by anyone (anonymous observations are
	// allowed); writing an *existing* one requires being its signed-in owner
	// or holding its write_token — see syncSessionSnapshot. Anonymous sessions
	// can later be claimed by email (see /api/sessions/claim) or, once the
	// observer signs in on any page, automatically (see /api/sessions/claim-local).
	try {
		await syncSessionSnapshot(db, parsed.data, locals.user?.id ?? null);
	} catch (err) {
		if (err instanceof SessionWriteForbiddenError) return json({ error: 'Forbidden' }, { status: 403 });
		throw err;
	}

	return json({ ok: true });
};
