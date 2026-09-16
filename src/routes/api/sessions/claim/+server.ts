import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setSessionClaimEmail } from '$lib/server/db/sessions';
import { getAuth } from '$lib/auth';

interface ClaimBody {
	sessionId: string;
	email: string;
}

/**
 * Associates an already-saved anonymous session with an email and sends a
 * magic link. The session is reassigned to the real user once they verify the
 * link (see claimSessionsByEmail, run on the /profile load).
 */
export const POST: RequestHandler = async ({ request, url, platform, locals }) => {
	const env = platform?.env;
	const db = env?.DB;
	if (!db) return json({ error: 'Database unavailable' }, { status: 503 });

	const { sessionId, email } = (await request.json()) as ClaimBody;
	if (!sessionId || !email) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	// If already signed in the session is theirs already — nothing to tag.
	if (!locals.user) {
		await setSessionClaimEmail(db, sessionId, email);
	}

	// Send the magic link — creates the account if needed.
	if (env.BETTER_AUTH_SECRET && env.RESEND_API_KEY) {
		try {
			await getAuth(env, url).api.signInMagicLink({
				headers: request.headers,
				body: { email, callbackURL: `${url.origin}/profile` }
			});
		} catch (e) {
			console.error('magic link send failed', e);
		}
	}

	return json({ ok: true });
};
