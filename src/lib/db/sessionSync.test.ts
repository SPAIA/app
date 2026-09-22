import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, type TestD1Database } from './testDb';
import { syncSessionSnapshot, claimSessionsByIds, SessionWriteForbiddenError } from '$lib/server/db/sessions';
import { getProfile } from '$lib/server/db/profiles';
import type { SessionSnapshot } from '$lib/session/snapshot';

const TOKEN = 'test-write-token-0000000000000000';
const OTHER_TOKEN = 'someone-elses-token-0000000000000';

function makeSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
	return {
		id: 'sess-1',
		writeToken: TOKEN,
		revision: 1,
		spaceId: 1,
		spotId: 1,
		locality: 'Neukölln',
		lat: 52.48,
		lng: 13.43,
		startedAt: '2026-01-01T10:00:00.000Z',
		durationMinutes: 5,
		weather: 'sunny',
		weatherObservationId: null,
		condition: null,
		notes: null,
		windObserved: null,
		focalArea: null,
		clockOffsetMs: 0,
		sightings: [],
		creatures: [],
		status: 'in_progress',
		...overrides
	};
}

function tap(name: string, tappedAt: string) {
	return { id: crypto.randomUUID(), insectName: name, tappedAt };
}

async function seedSpot(db: TestD1Database, id = 1) {
	db.raw.prepare('INSERT INTO spots (id, space_id, slug, name, icon) VALUES (?, 1, ?, ?, ?)').run(id, `spot-${id}`, `Spot ${id}`, '🌳');
}

async function seedInsectType(db: TestD1Database, name: string) {
	db.raw.prepare('INSERT INTO insect_types (name, icon, sort_order, active) VALUES (?, ?, 0, 1)').run(name, '🐝');
}

describe('syncSessionSnapshot', () => {
	let db: TestD1Database;

	beforeEach(async () => {
		db = createTestDb();
		await seedSpot(db);
		await seedInsectType(db, 'bee');
	});

	it('replacing sighting counts: syncing A then B leaves the database matching B', async () => {
		const bees5 = Array.from({ length: 5 }, (_, i) => tap('bee', `2026-01-01T10:00:0${i}.000Z`));
		await syncSessionSnapshot(db, makeSnapshot({ revision: 1, sightings: bees5 }), null);

		let rows = db.raw.prepare('SELECT COUNT(*) as n FROM sightings WHERE session_id = ?').get('sess-1') as { n: number };
		expect(rows.n).toBe(5);

		const bees4 = Array.from({ length: 4 }, (_, i) => tap('bee', `2026-01-01T10:01:0${i}.000Z`));
		await syncSessionSnapshot(db, makeSnapshot({ revision: 2, sightings: bees4 }), null);

		rows = db.raw.prepare('SELECT COUNT(*) as n FROM sightings WHERE session_id = ?').get('sess-1') as { n: number };
		expect(rows.n).toBe(4);

		const session = db.raw.prepare('SELECT total_count FROM sessions WHERE id = ?').get('sess-1') as { total_count: number };
		expect(session.total_count).toBe(4);
	});

	it('is idempotent: sending the identical completed snapshot twice produces one session, correct sightings/creatures/duration, and one streak bump', async () => {
		const snapshot = makeSnapshot({
			sightings: [tap('bee', '2026-01-01T10:00:00.000Z'), tap('bee', '2026-01-01T10:00:01.000Z')],
			creatures: [{ creature: 'snail', label: null }],
			status: 'complete'
		});

		await syncSessionSnapshot(db, snapshot, 'user-1');
		await syncSessionSnapshot(db, snapshot, 'user-1'); // exact retry — e.g. a lost response

		const sessions = db.raw.prepare('SELECT * FROM sessions').all() as { id: string; total_count: number; duration_min: number; completed_at: string | null }[];
		expect(sessions).toHaveLength(1);
		expect(sessions[0].total_count).toBe(2);
		expect(sessions[0].duration_min).toBe(5);
		expect(sessions[0].completed_at).not.toBeNull();

		const sightingCount = db.raw.prepare('SELECT COUNT(*) as n FROM sightings WHERE session_id = ?').get('sess-1') as { n: number };
		expect(sightingCount.n).toBe(2);

		const creatures = db.raw.prepare('SELECT * FROM session_creatures WHERE session_id = ?').all('sess-1') as unknown[];
		expect(creatures).toHaveLength(1);

		const profile = await getProfile(db, 'user-1');
		expect(profile?.streak_days).toBe(1); // bumped once, not twice
	});

	it('retry after a lost response leaves the database unchanged (same completed_at, same counts)', async () => {
		const snapshot = makeSnapshot({ sightings: [tap('bee', '2026-01-01T10:00:00.000Z')], status: 'complete' });

		await syncSessionSnapshot(db, snapshot, 'user-1');
		const first = db.raw.prepare('SELECT completed_at, total_count FROM sessions WHERE id = ?').get('sess-1');

		// Client assumed the request failed (response lost) and retries the exact same snapshot.
		await syncSessionSnapshot(db, snapshot, 'user-1');
		const second = db.raw.prepare('SELECT completed_at, total_count FROM sessions WHERE id = ?').get('sess-1');

		expect(second).toEqual(first);
	});

	it('a stale (older-revision) snapshot cannot un-complete a session', async () => {
		await syncSessionSnapshot(
			db,
			makeSnapshot({ revision: 5, sightings: [tap('bee', '2026-01-01T10:00:00.000Z')], status: 'complete' }),
			null
		);
		const completed = db.raw.prepare('SELECT completed_at, total_count FROM sessions WHERE id = ?').get('sess-1') as {
			completed_at: string | null;
			total_count: number;
		};
		expect(completed.completed_at).not.toBeNull();

		// A delayed in-progress heartbeat from before completion, arriving late.
		await syncSessionSnapshot(db, makeSnapshot({ revision: 3, sightings: [], status: 'in_progress' }), null);

		const after = db.raw.prepare('SELECT completed_at, total_count FROM sessions WHERE id = ?').get('sess-1') as {
			completed_at: string | null;
			total_count: number;
		};
		expect(after.completed_at).toBe(completed.completed_at);
		expect(after.total_count).toBe(completed.total_count);
	});

	it('rejects a write to an existing anonymous session with the wrong write token', async () => {
		await syncSessionSnapshot(db, makeSnapshot({ revision: 1 }), null);

		await expect(
			syncSessionSnapshot(db, makeSnapshot({ revision: 2, writeToken: OTHER_TOKEN }), null)
		).rejects.toBeInstanceOf(SessionWriteForbiddenError);

		// The forbidden write must not have applied.
		const session = db.raw.prepare('SELECT revision FROM sessions WHERE id = ?').get('sess-1') as { revision: number };
		expect(session.revision).toBe(1);
	});

	it('rejects a write to a user-owned session from a different (or no) identity', async () => {
		await syncSessionSnapshot(db, makeSnapshot({ revision: 1 }), 'user-1');

		await expect(syncSessionSnapshot(db, makeSnapshot({ revision: 2 }), 'user-2')).rejects.toBeInstanceOf(
			SessionWriteForbiddenError
		);
		await expect(syncSessionSnapshot(db, makeSnapshot({ revision: 2 }), null)).rejects.toBeInstanceOf(
			SessionWriteForbiddenError
		);

		const session = db.raw.prepare('SELECT revision, user_id FROM sessions WHERE id = ?').get('sess-1') as {
			revision: number;
			user_id: string;
		};
		expect(session.revision).toBe(1);
		expect(session.user_id).toBe('user-1');
	});

	it('the signed-in owner can keep syncing their own session regardless of write token', async () => {
		await syncSessionSnapshot(db, makeSnapshot({ revision: 1 }), 'user-1');

		await expect(
			syncSessionSnapshot(db, makeSnapshot({ revision: 2, writeToken: OTHER_TOKEN, notes: 'still me' }), 'user-1')
		).resolves.toBeUndefined();

		const session = db.raw.prepare('SELECT notes FROM sessions WHERE id = ?').get('sess-1') as { notes: string };
		expect(session.notes).toBe('still me');
	});

	it('derived spot aggregates (spot_insect_stats, total_minutes_observed) are recomputed, not double-counted, on repeat sync', async () => {
		const snapshot = makeSnapshot({
			sightings: [tap('bee', '2026-01-01T10:00:00.000Z'), tap('bee', '2026-01-01T10:00:01.000Z')],
			status: 'complete'
		});

		await syncSessionSnapshot(db, snapshot, 'user-1');
		await syncSessionSnapshot(db, snapshot, 'user-1');

		const stat = db.raw.prepare('SELECT total_count FROM spot_insect_stats WHERE spot_id = 1 AND insect_name = ?').get('bee') as { total_count: number };
		expect(stat.total_count).toBe(2);

		const spot = db.raw.prepare('SELECT total_minutes_observed FROM spots WHERE id = 1').get() as { total_minutes_observed: number };
		expect(spot.total_minutes_observed).toBe(5);
	});

	it('recovers an in-progress session (a snapshot can be synced, then synced again with more taps, without losing prior fields)', async () => {
		await syncSessionSnapshot(db, makeSnapshot({ revision: 1, notes: 'saw a wasp too' }), null);
		await syncSessionSnapshot(
			db,
			makeSnapshot({ revision: 2, sightings: [tap('bee', '2026-01-01T10:05:00.000Z')], notes: 'saw a wasp too' }),
			null
		);

		const session = db.raw.prepare('SELECT notes, total_count, completed_at FROM sessions WHERE id = ?').get('sess-1') as {
			notes: string;
			total_count: number;
			completed_at: string | null;
		};
		expect(session.notes).toBe('saw a wasp too');
		expect(session.total_count).toBe(1);
		expect(session.completed_at).toBeNull();
	});

	it('uploads a completed offline session on the next sync (app restart) and it lands as complete', async () => {
		const snapshot = makeSnapshot({ sightings: [tap('bee', '2026-01-01T10:00:00.000Z')], status: 'complete' });

		// Simulates: session completed while offline, app restarts, snapshot is resent.
		await syncSessionSnapshot(db, snapshot, null);

		const session = db.raw.prepare('SELECT completed_at, total_count FROM sessions WHERE id = ?').get('sess-1') as {
			completed_at: string | null;
			total_count: number;
		};
		expect(session.completed_at).not.toBeNull();
		expect(session.total_count).toBe(1);
	});

	it('anonymous session can be claimed by a user after authentication, and their own later syncs still work', async () => {
		await syncSessionSnapshot(db, makeSnapshot({ revision: 1, status: 'complete' }), null);

		let session = db.raw.prepare('SELECT user_id FROM sessions WHERE id = ?').get('sess-1') as { user_id: string };
		expect(session.user_id.startsWith('anon:')).toBe(true);

		await claimSessionsByIds(db, ['sess-1'], 'user-42');

		session = db.raw.prepare('SELECT user_id FROM sessions WHERE id = ?').get('sess-1') as { user_id: string };
		expect(session.user_id).toBe('user-42');

		// The claimed owner, now signed in, can keep syncing (e.g. a trailing edit).
		await syncSessionSnapshot(db, makeSnapshot({ revision: 2, status: 'complete', notes: 'final note' }), 'user-42');
		session = db.raw.prepare('SELECT user_id FROM sessions WHERE id = ?').get('sess-1') as { user_id: string };
		expect(session.user_id).toBe('user-42');

		// An anonymous request — e.g. a stale retry from the device that never
		// saw its own original success — is now correctly forbidden, not
		// silently downgraded back to anon.
		await expect(
			syncSessionSnapshot(db, makeSnapshot({ revision: 3, status: 'complete' }), null)
		).rejects.toBeInstanceOf(SessionWriteForbiddenError);
	});
});
