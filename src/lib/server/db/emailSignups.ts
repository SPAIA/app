import type { D1Database } from './d1';

/**
 * Saves the address (and the kind of place it's for) and returns the token
 * for its link email. An unconfirmed address gets a fresh token on each
 * re-submit, so only the latest email's link works; a confirmed one keeps its
 * token — the link doubles as their standing "add your place" link.
 */
export async function addEmailSignup(
	db: D1Database,
	signup: { email: string; source: string; placeType: string | null }
): Promise<string> {
	const row = await db
		.prepare(`
			INSERT INTO email_signups (email, source, place_type, confirm_token)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(email, source) DO UPDATE SET
				place_type = COALESCE(excluded.place_type, email_signups.place_type),
				confirm_token = CASE WHEN email_signups.confirmed_at IS NULL
					THEN excluded.confirm_token ELSE email_signups.confirm_token END
			RETURNING confirm_token
		`)
		.bind(signup.email, signup.source, signup.placeType, crypto.randomUUID())
		.first<{ confirm_token: string }>();
	if (!row) throw new Error('email_signups upsert returned no row');
	return row.confirm_token;
}

/**
 * Marks the signup holding this token as confirmed and returns its place
 * type. Idempotent — the same link keeps working. Returns null for an unknown
 * (or superseded) token.
 */
export async function confirmEmailSignup(
	db: D1Database,
	token: string
): Promise<{ placeType: string | null } | null> {
	const row = await db
		.prepare(`
			UPDATE email_signups SET confirmed_at = COALESCE(confirmed_at, datetime('now'))
			WHERE confirm_token = ?
			RETURNING place_type
		`)
		.bind(token)
		.first<{ place_type: string | null }>();
	return row ? { placeType: row.place_type } : null;
}

export async function getAllEmailSignupsForExport(db: D1Database): Promise<Record<string, unknown>[]> {
	// confirm_token left out on purpose — it's a credential, not data.
	const result = await db
		.prepare('SELECT id, email, source, place_type, created_at, confirmed_at FROM email_signups ORDER BY id ASC')
		.all<Record<string, unknown>>();
	return result.results;
}
