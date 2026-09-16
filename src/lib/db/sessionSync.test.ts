import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, type TestD1Database } from './testDb';
import { syncSessionSnapshot, claimSessionsByIds } from '$lib/server/db/sessions';
import { getProfile } from '$lib/server/db/profiles';
import type { SessionSnapshot } from '$lib/session/snapshot';

function makeSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
	return {
		id: 'sess-1',
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
		await syncSessionSnapshot(db, makeSnapshot({ sightings: bees5 }), 'anon:device-1');

		let rows = db.raw.prepare('SELECT COUNT(*) as n FROM sightings WHERE session_id = ?').get('sess-1') as { n: number };
		expect(rows.n).toBe(5);

		const bees4 = Array.from({ length: 4 }, (_, i) => tap('bee', `2026-01-01T10:01:0${i}.000Z`));
		await syncSessionSnapshot(db, makeSnapshot({ sightings: bees4 }), 'anon:device-1');

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
		await syncSessionSnapshot(db, makeSnapshot({ notes: 'saw a wasp too' }), 'anon:device-1');
		await syncSessionSnapshot(
			db,
			makeSnapshot({ sightings: [tap('bee', '2026-01-01T10:05:00.000Z')], notes: 'saw a wasp too' }),
			'anon:device-1'
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
		await syncSessionSnapshot(db, snapshot, 'anon:device-1');

		const session = db.raw.prepare('SELECT completed_at, total_count FROM sessions WHERE id = ?').get('sess-1') as {
			completed_at: string | null;
			total_count: number;
		};
		expect(session.completed_at).not.toBeNull();
		expect(session.total_count).toBe(1);
	});

	it('anonymous session can be claimed by a user after authentication', async () => {
		await syncSessionSnapshot(db, makeSnapshot({ status: 'complete' }), 'anon:device-1');

		let session = db.raw.prepare('SELECT user_id FROM sessions WHERE id = ?').get('sess-1') as { user_id: string };
		expect(session.user_id).toBe('anon:device-1');

		await claimSessionsByIds(db, ['sess-1'], 'user-42');

		session = db.raw.prepare('SELECT user_id FROM sessions WHERE id = ?').get('sess-1') as { user_id: string };
		expect(session.user_id).toBe('user-42');

		// A later sync (e.g. one last 30s tick in flight when sign-in happened)
		// must not clobber the real owner with a fresh anon id.
		await syncSessionSnapshot(db, makeSnapshot({ status: 'complete' }), 'anon:device-2');
		session = db.raw.prepare('SELECT user_id FROM sessions WHERE id = ?').get('sess-1') as { user_id: string };
		expect(session.user_id).toBe('user-42');
	});
});
