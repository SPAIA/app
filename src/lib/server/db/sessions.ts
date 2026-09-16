import type { Session } from '$lib/types';
import type { SessionSnapshot } from '$lib/session/snapshot';
import { updateStreak } from '$lib/gamification';
import type { D1Database, D1PreparedStatement } from './d1';
import { getInsectTypes } from './sightings';
import { getProfile, upsertProfile } from './profiles';
import { recomputeSpotAggregates } from './spots';

export async function getUserSessions(db: D1Database, userId: string): Promise<Session[]> {
	const result = await db
		.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC')
		.bind(userId)
		.all<Session>();
	return result.results;
}

export async function getSessionById(
	db: D1Database,
	sessionId: string
): Promise<(Session & { space_name: string | null }) | null> {
	return db
		.prepare(`
			SELECT sessions.*, spaces.name as space_name
			FROM sessions
			LEFT JOIN spaces ON spaces.id = sessions.space_id
			WHERE sessions.id = ?
		`)
		.bind(sessionId)
		.first<Session & { space_name: string | null }>();
}

/**
 * Idempotent replacement sync: makes the persisted session match `snapshot`
 * exactly, in one D1 transaction. Safe to call repeatedly with the same
 * snapshot (retries) or out of order followed by the latest one — the result
 * only ever depends on the snapshot's own content, never on how many times
 * or in what order it was sent. See PUT /api/sessions/[id].
 *
 * `user_id` only ever moves from an anon owner to a real one, never back —
 * see the CASE WHEN below.
 *
 * `completed_at` is set once, the first time a snapshot for this session
 * arrives with status 'complete', and never overwritten after — this (plus
 * full delete-and-reinsert of sightings/creatures, and aggregate recompute
 * rather than +1/-1 mutation) is what makes retrying a completed sync safe:
 * it can never double-apply observed minutes, duplicate sightings/creatures,
 * or bump a streak twice.
 */
export async function syncSessionSnapshot(
	db: D1Database,
	snapshot: SessionSnapshot,
	userId: string
): Promise<void> {
	const insectTypes = await getInsectTypes(db);
	const insectTypeId = new Map(insectTypes.map((i) => [i.name, i.id]));

	const existing = await db
		.prepare('SELECT completed_at FROM sessions WHERE id = ?')
		.bind(snapshot.id)
		.first<{ completed_at: string | null }>();
	const previousCompletedAt = existing?.completed_at ?? null;
	const isFirstCompletion = previousCompletedAt === null && snapshot.status === 'complete';
	const completedAt = snapshot.status === 'complete' ? (previousCompletedAt ?? sqliteNow()) : null;
	const totalCount = snapshot.sightings.length;

	const statements: D1PreparedStatement[] = [
		db
			.prepare(`
				INSERT INTO sessions (id, user_id, space_id, spot_id, locality, weather, weather_observation_id, condition, notes, wind_observed, focal_area, lat, lng, duration_min, started_at, clock_offset_ms, total_count, completed_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					user_id = CASE WHEN excluded.user_id NOT LIKE 'anon:%' THEN excluded.user_id ELSE sessions.user_id END,
					space_id = excluded.space_id,
					spot_id = excluded.spot_id,
					locality = excluded.locality,
					weather = excluded.weather,
					weather_observation_id = excluded.weather_observation_id,
					condition = excluded.condition,
					notes = excluded.notes,
					wind_observed = excluded.wind_observed,
					focal_area = excluded.focal_area,
					lat = excluded.lat,
					lng = excluded.lng,
					duration_min = excluded.duration_min,
					started_at = excluded.started_at,
					clock_offset_ms = excluded.clock_offset_ms,
					total_count = excluded.total_count,
					completed_at = excluded.completed_at
			`)
			.bind(
				snapshot.id,
				userId,
				snapshot.spaceId,
				snapshot.spotId,
				snapshot.locality,
				snapshot.weather,
				snapshot.weatherObservationId,
				snapshot.condition,
				snapshot.notes,
				snapshot.windObserved,
				snapshot.focalArea,
				snapshot.lat,
				snapshot.lng,
				snapshot.durationMinutes,
				snapshot.startedAt,
				snapshot.clockOffsetMs,
				totalCount,
				completedAt
			),
		db.prepare('DELETE FROM sightings WHERE session_id = ?').bind(snapshot.id),
		...snapshot.sightings.map((tap) =>
			db
				.prepare(
					'INSERT INTO sightings (session_id, insect_type_id, insect_name, count, tapped_at, tap_id) VALUES (?, ?, ?, 1, ?, ?)'
				)
				.bind(snapshot.id, insectTypeId.get(tap.insectName) ?? null, tap.insectName, tap.tappedAt, tap.id)
		),
		db.prepare('DELETE FROM session_creatures WHERE session_id = ?').bind(snapshot.id),
		...snapshot.creatures.map((c) =>
			db
				.prepare('INSERT INTO session_creatures (session_id, creature, label) VALUES (?, ?, ?)')
				.bind(snapshot.id, c.creature, c.label)
		)
	];

	if (snapshot.spotId) statements.push(...recomputeSpotAggregates(db, snapshot.spotId));

	await db.batch(statements);

	// Streak is a signed-in feature; don't create junk profiles for anon
	// owners, and only bump it the one time this session actually completes —
	// isFirstCompletion is false on every retry.
	if (isFirstCompletion && !userId.startsWith('anon:')) {
		const profile = await getProfile(db, userId);
		const { newStreak, newLastDate } = updateStreak(
			profile?.streak_days ?? 0,
			profile?.streak_last_date ?? null
		);
		await upsertProfile(db, userId, { streak_days: newStreak, streak_last_date: newLastDate });
	}
}

/** SQLite's `datetime('now')` format (UTC, space-separated, no fractional seconds) — matches existing stored timestamps. */
function sqliteNow(): string {
	return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/** Stamps an as-yet-anonymous session with the email that wants to claim it. */
export async function setSessionClaimEmail(
	db: D1Database,
	sessionId: string,
	email: string
): Promise<void> {
	await db
		.prepare(`UPDATE sessions SET claim_email = ? WHERE id = ? AND user_id LIKE 'anon:%'`)
		.bind(email, sessionId)
		.run();
}

/**
 * Reassigns every anonymous session tagged with `email` to a real user id.
 * Called once a magic link is verified, so observations made before sign-in
 * land in the user's collection. Idempotent.
 */
export async function claimSessionsByEmail(
	db: D1Database,
	email: string,
	userId: string
): Promise<void> {
	await db
		.prepare(`UPDATE sessions SET user_id = ?, claim_email = NULL WHERE claim_email = ? AND user_id LIKE 'anon:%'`)
		.bind(userId, email)
		.run();
}

/**
 * Reassigns specific anon-owned sessions to a real user id, keyed by the
 * session ids a browser tracked locally (see $lib/localSessions). Lets a
 * device's past anonymous observations get linked the moment the observer
 * signs in normally, without requiring the email-claim flow. Idempotent.
 */
export async function claimSessionsByIds(
	db: D1Database,
	sessionIds: string[],
	userId: string
): Promise<void> {
	if (sessionIds.length === 0) return;
	const placeholders = sessionIds.map(() => '?').join(',');
	await db
		.prepare(`UPDATE sessions SET user_id = ?, claim_email = NULL WHERE id IN (${placeholders}) AND user_id LIKE 'anon:%'`)
		.bind(userId, ...sessionIds)
		.run();
}

export async function getAllSessionsForExport(db: D1Database): Promise<Record<string, unknown>[]> {
	const result = await db.prepare('SELECT * FROM sessions ORDER BY started_at ASC').all<Record<string, unknown>>();
	return result.results;
}
