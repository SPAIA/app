import { z } from 'zod';
import { browser } from '$app/environment';
import type { SessionState } from '$lib/stores/session';

/**
 * The complete state of one observation, local or server. This is the only
 * shape persisted to localStorage and synced to the server — see
 * $lib/session/sync.ts. Deliberately excludes pure-UI fields (step,
 * visionStatus, photoUrl, ...) that live only in SessionState.
 */
export const SessionSnapshotSchema = z.object({
	id: z.string(),
	/** Per-session write credential, minted once at session start — see syncSessionSnapshot. */
	writeToken: z.string().min(16),
	/** Bumped locally on every meaningful state change — lets the server reject a stale/out-of-order sync. */
	revision: z.number().int().nonnegative(),
	spaceId: z.number().nullable(),
	spotId: z.number().nullable(),
	locality: z.string().nullable(),
	lat: z.number().nullable(),
	lng: z.number().nullable(),
	startedAt: z.string().nullable(),
	durationMinutes: z.number(),
	weather: z.enum(['sunny', 'partly', 'overcast', 'rainy']).nullable(),
	weatherObservationId: z.number().nullable(),
	condition: z.string().nullable(),
	notes: z.string().nullable(),
	windObserved: z.enum(['still', 'light_breeze', 'leaves_moving', 'branches_moving']).nullable(),
	focalArea: z.string().nullable(),
	clockOffsetMs: z.number(),
	sightings: z.array(
		z.object({
			id: z.string(),
			insectName: z.string(),
			tappedAt: z.string()
		})
	),
	creatures: z.array(
		z.object({
			creature: z.enum(['snail', 'mouse', 'worm', 'spider', 'bird', 'hedgehog', 'other']),
			label: z.string().nullable()
		})
	),
	status: z.enum(['in_progress', 'complete'])
});

export type SessionSnapshot = z.infer<typeof SessionSnapshotSchema>;

/** Builds the persisted/synced snapshot from the full UI session state. Returns null before a session has started. */
export function toSnapshot(s: SessionState): SessionSnapshot | null {
	if (!s.sessionId || !s.writeToken) return null;
	return {
		id: s.sessionId,
		writeToken: s.writeToken,
		revision: s.revision,
		spaceId: s.spaceId,
		spotId: s.spotId,
		locality: s.locality,
		lat: s.lat,
		lng: s.lng,
		startedAt: s.startedAt,
		durationMinutes: s.totalDurationMin,
		weather: s.weather,
		weatherObservationId: s.weatherObservationId,
		condition: s.condition,
		notes: s.notes,
		windObserved: s.windObserved,
		focalArea: s.focalArea || null,
		clockOffsetMs: s.clockOffsetMs,
		sightings: s.taps.map((t) => ({ id: t.id, insectName: t.name, tappedAt: t.tappedAt })),
		// SessionState keeps `creature` as a plain string (it's built from a fixed
		// set of UI options, see CardsStep's creatureOptions) — narrow here at the
		// one point that needs the literal union, rather than tightening the
		// whole store's type for a UI-only concern.
		creatures: s.otherCreatures as SessionSnapshot['creatures'],
		status: s.status
	};
}

const STORAGE_KEY = 'spaia:active-session:v2';
const MAX_TRACKED = 20;

interface StoredSnapshots {
	version: 2;
	sessions: Record<string, SessionSnapshot>;
}

function readAll(): StoredSnapshots {
	if (!browser) return { version: 2, sessions: {} };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { version: 2, sessions: {} };
		const parsed = JSON.parse(raw) as StoredSnapshots;
		if (parsed.version !== 2 || !parsed.sessions) return { version: 2, sessions: {} };
		return parsed;
	} catch {
		return { version: 2, sessions: {} };
	}
}

function writeAll(store: StoredSnapshots): void {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
	} catch {
		// localStorage unavailable (private mode, quota, etc.) — non-fatal, just means no local backup
	}
}

/** Persists the full current snapshot immediately — call on every meaningful state change. */
export function saveLocalSnapshot(snapshot: SessionSnapshot): void {
	if (!browser) return;
	const store = readAll();
	store.sessions[snapshot.id] = snapshot;
	const ids = Object.keys(store.sessions);
	if (ids.length > MAX_TRACKED) {
		for (const id of ids.slice(0, ids.length - MAX_TRACKED)) delete store.sessions[id];
	}
	writeAll(store);
}

/** Removes a snapshot once the server has confirmed it — call after a successful sync of a completed session. */
export function removeLocalSnapshot(id: string): void {
	if (!browser) return;
	const store = readAll();
	if (!(id in store.sessions)) return;
	delete store.sessions[id];
	writeAll(store);
}

/** Every snapshot still pending on this device — in-progress ones can be resumed, completed ones just need re-sending. */
export function listLocalSnapshots(): SessionSnapshot[] {
	return Object.values(readAll().sessions);
}
