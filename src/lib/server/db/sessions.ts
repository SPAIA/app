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

/**
 * Explicit column list, not `SELECT *` — this feeds the public
 * /share/[sessionId] page, so it must never return claim_email (a real
 * email address) or write_token (a write credential for the session).
 */
export async function getSessionById(
	db: D1Database,
	sessionId: string
): Promise<(Omit<Session, 'claim_email' | 'write_token'> & { space_name: string | null; locality: string | null }) | null> {
	return db
		.prepare(`
			SELECT
				sessions.id, sessions.user_id, sessions.space_id, sessions.spot_id,
				sessions.weather, sessions.weather_observation_id, sessions.condition, sessions.notes,
				sessions.wind_observed, sessions.focal_area, sessions.lat, sessions.lng, sessions.duration_min,
				sessions.started_at, sessions.completed_at, sessions.clock_offset_ms, sessions.total_count,
				sessions.shared, sessions.revision,
				spaces.name as space_name, spaces.locality
			FROM sessions
			LEFT JOIN spaces ON spaces.id = sessions.space_id
			WHERE sessions.id = ?
		`)
		.bind(sessionId)
		.first<Omit<Session, 'claim_email' | 'write_token'> & { space_name: string | null; locality: string | null }>();
}

/** Thrown by syncSessionSnapshot when the caller isn't the session's owner (real user) or write-token holder (anonymous). */
export class SessionWriteForbiddenError extends Error {}

/**
 * Idempotent replacement sync: makes the persisted session match `snapshot`
 * exactly, in one D1 transaction. Safe to call repeatedly with the same
 * snapshot (retries) or out of order followed by the latest one — the result
 * only ever depends on the snapshot's own content, never on how many times
 * or in what order it was sent. See PUT /api/sessions/[id].
 *
 * Authorization: a caller may write an *existing* session only if they are
 * its signed-in owner, or — for a still-anonymous session — hold its
 * write_token. A brand new session id may always be created. This matters
 * because session ids are exposed publicly via /share/[sessionId]; without
 * it, knowing/guessing a shared id would be enough to overwrite someone
 * else's observation. Throws SessionWriteForbiddenError otherwise.
 *
 * Staleness: `snapshot.revision` must be >= the stored revision, or the
 * whole sync is a no-op. Without this, a delayed in-progress snapshot
 * arriving after a completion could null out completed_at (and revert other
 * fields) — see the migration this shipped with for more. The SQL-level
 * `WHERE excluded.revision >= sessions.revision` guard additionally covers
 * the (rare, self-healing) case where two syncs for the same session race
 * each other: the loser's session-row write is atomically dropped, even
 * though its child-table writes below aren't — the next sync from either
 * side reconciles everything again.
 *
 * `user_id` only ever moves from an anon owner to a real one, never back.
 *
 * `completed_at` is set once, the first time an accepted snapshot for this
 * session has status 'complete', and never overwritten after (the COALESCE
 * below) — this (plus full delete-and-reinsert of sightings/creatures, and
 * aggregate recompute rather than +1/-1 mutation) is what makes retrying a
 * completed sync safe: it can never double-apply observed minutes,
 * duplicate sightings/creatures, or bump a streak twice.
 */
export async function syncSessionSnapshot(
	db: D1Database,
	snapshot: SessionSnapshot,
	authUserId: string | null
): Promise<void> {
	const existing = await db
		.prepare('SELECT completed_at, revision, user_id, write_token FROM sessions WHERE id = ?')
		.bind(snapshot.id)
		.first<{ completed_at: string | null; revision: number; user_id: string; write_token: string | null }>();

	if (existing) {
		const ownedByRealUser = !existing.user_id.startsWith('anon:');
		const authorized = ownedByRealUser
			? authUserId === existing.user_id
			: existing.write_token != null && existing.write_token === snapshot.writeToken;
		if (!authorized) throw new SessionWriteForbiddenError(`Not authorized to write session ${snapshot.id}`);

		// A newer snapshot already landed — silently drop this one rather than regress the session.
		if (snapshot.revision < existing.revision) return;
	}

	const insectTypes = await getInsectTypes(db);
	const insectTypeId = new Map(insectTypes.map((i) => [i.name, i.id]));

	const previousCompletedAt = existing?.completed_at ?? null;
	const isFirstCompletion = previousCompletedAt === null && snapshot.status === 'complete';
	const completedAt = snapshot.status === 'complete' ? (previousCompletedAt ?? completionTime(snapshot)) : null;
	const totalCount = snapshot.sightings.length;
	// A brand-new row takes whichever owner is making the request (real user,
	// or a throwaway anon id — never read again except via write_token from
	// here on). An existing row only ever gets upgraded from anon to real,
	// never the reverse or sideways — enforced above by the authorization
	// check, not by this expression alone.
	const ownerId = authUserId ?? existing?.user_id ?? `anon:${crypto.randomUUID()}`;

	const statements: D1PreparedStatement[] = [
		db
			.prepare(`
				INSERT INTO sessions (id, user_id, space_id, spot_id, weather, weather_observation_id, condition, notes, wind_observed, focal_area, lat, lng, duration_min, started_at, clock_offset_ms, total_count, completed_at, revision, write_token, last_active_at)
				-- space_id follows the spot's current space rather than the client's
				-- copy, so an offline session synced after its spot was moved to
				-- another space still lands in the new one.
				VALUES (?, ?, COALESCE((SELECT space_id FROM spots WHERE id = ?), ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
				ON CONFLICT(id) DO UPDATE SET
					user_id = excluded.user_id,
					space_id = excluded.space_id,
					spot_id = excluded.spot_id,
					weather = excluded.weather,
					weather_observation_id = excluded.weather_observation_id,
					condition = excluded.condition,
					notes = excluded.notes,
					wind_observed = excluded.wind_observed,
					focal_area = excluded.focal_area,
					lat = excluded.lat,
					lng = excluded.lng,
					-- An in-progress snapshot arriving after the session was completed
					-- (a dead device's backup, resent once it's back on) still carries
					-- the planned timer length — keep the observed duration already set.
					duration_min = CASE
						WHEN sessions.completed_at IS NOT NULL AND excluded.completed_at IS NULL THEN sessions.duration_min
						ELSE excluded.duration_min
					END,
					started_at = excluded.started_at,
					clock_offset_ms = excluded.clock_offset_ms,
					total_count = excluded.total_count,
					completed_at = COALESCE(sessions.completed_at, excluded.completed_at),
					revision = excluded.revision,
					last_active_at = excluded.last_active_at
				WHERE excluded.revision >= sessions.revision
			`)
			.bind(
				snapshot.id,
				ownerId,
				snapshot.spotId,
				snapshot.spaceId,
				snapshot.spotId,
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
				completedAt,
				snapshot.revision,
				snapshot.writeToken
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
	if (isFirstCompletion && authUserId) {
		const profile = await getProfile(db, authUserId);
		const { newStreak, newLastDate } = updateStreak(
			profile?.streak_days ?? 0,
			profile?.streak_last_date ?? null
		);
		await upsertProfile(db, authUserId, { streak_days: newStreak, streak_last_date: newLastDate });
	}
}

/** SQLite's `datetime('now')` format (UTC, space-separated, no fractional seconds) — matches existing stored timestamps. */
function toSqliteDatetime(date: Date): string {
	return date.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * When the count actually ended: the timer's scheduled end (start + duration),
 * or now if that's still in the future (the observer finished early). A
 * completion that only reaches the server later — a dead battery, or offline
 * until the next app load — is stamped with when the count happened, not
 * when it was finally uploaded.
 */
function completionTime(snapshot: SessionSnapshot): string {
	const now = Date.now();
	const started = snapshot.startedAt ? Date.parse(snapshot.startedAt) : NaN;
	const end = Number.isNaN(started) ? now : Math.min(now, started + snapshot.durationMinutes * 60_000);
	return toSqliteDatetime(new Date(end));
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

/** How long past a count's scheduled end the sweep waits before completing it for the observer. */
const EXPIRED_SESSION_GRACE_MIN = 30;

/**
 * When an abandoned count stopped: the last sync (the client syncs every 30s
 * while its timer runs), falling back to the last tap for sessions synced
 * before last_active_at existed — capped at the planned end, since syncs keep
 * arriving from the thank-you and cards screens after the timer.
 */
const OBSERVED_END_SQL = `MIN(
	datetime(started_at, '+' || duration_min || ' minutes'),
	COALESCE(last_active_at, (SELECT MAX(datetime(si.tapped_at)) FROM sightings si WHERE si.session_id = sessions.id))
)`;

/**
 * Completes counts whose device never sent the completion — a dead battery or
 * a closed tab. Runs from the scheduled handler (see worker/index.ts). The
 * server already has every tap up to the last 30s sync, and the count is
 * ended at its last sign of life (see OBSERVED_END_SQL), with duration_min set
 * to the time actually observed rather than the planned timer length.
 *
 * Only counts with at least one tap: started_at is first set when the setup
 * step begins, so without a tap there's no telling a real zero count from
 * setup the observer abandoned. If the device does come back later, its sync
 * is still accepted and completed_at stays put (see syncSessionSnapshot).
 */
export async function completeExpiredSessions(db: D1Database): Promise<number> {
	const { results: expired } = await db
		.prepare(`
			SELECT id, user_id, spot_id, started_at FROM sessions
			WHERE completed_at IS NULL
				AND started_at IS NOT NULL
				AND EXISTS (SELECT 1 FROM sightings si WHERE si.session_id = sessions.id)
				AND datetime(started_at, '+' || (duration_min + ?) || ' minutes') < datetime('now')
		`)
		.bind(EXPIRED_SESSION_GRACE_MIN)
		.all<{ id: string; user_id: string; spot_id: number | null; started_at: string }>();
	if (expired.length === 0) return 0;

	const statements: D1PreparedStatement[] = expired.map((s) =>
		db
			.prepare(`
				UPDATE sessions
				SET completed_at = ${OBSERVED_END_SQL},
					duration_min = MAX(1, CAST(ROUND((strftime('%s', ${OBSERVED_END_SQL}) - strftime('%s', started_at)) / 60.0) AS INTEGER)),
					total_count = (SELECT COUNT(*) FROM sightings si WHERE si.session_id = sessions.id)
				WHERE id = ? AND completed_at IS NULL
			`)
			.bind(s.id)
	);
	const spotIds = new Set(expired.map((s) => s.spot_id).filter((id): id is number => id !== null));
	for (const spotId of spotIds) statements.push(...recomputeSpotAggregates(db, spotId));
	await db.batch(statements);

	// updateStreak always stamps today, so only a count from today may bump it —
	// an older one (a first sweep over historical rows) would wrongly extend
	// the streak to a day nothing was observed. Same-day bumps are idempotent,
	// so a client completion racing this one can't double-count.
	const today = new Date().toISOString().slice(0, 10);
	const streakUserIds = new Set(
		expired
			.filter((s) => !s.user_id.startsWith('anon:') && s.started_at.slice(0, 10) === today)
			.map((s) => s.user_id)
	);
	for (const userId of streakUserIds) {
		const profile = await getProfile(db, userId);
		const { newStreak, newLastDate } = updateStreak(profile?.streak_days ?? 0, profile?.streak_last_date ?? null);
		await upsertProfile(db, userId, { streak_days: newStreak, streak_last_date: newLastDate });
	}

	return expired.length;
}
