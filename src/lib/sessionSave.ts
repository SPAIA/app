import { get } from 'svelte/store';
import { sessionStore, type SessionState } from './stores/session';
import type { SpotSessionComparison } from './types';

/**
 * tappedAt values already confirmed persisted server-side. Keyed by the tap
 * itself, not by array position — ObserveStep's undo button can splice a tap
 * out of the middle of `taps` (if other species were tapped after it), and a
 * plain "first N are saved" count would silently desync in that case: every
 * tap that shifted into the "already saved" range afterward would never
 * actually get sent. tappedAt is set once per tap (nowISO(), millisecond
 * precision) and never changes, so it's a safe stable key.
 */
let sentTapKeys = new Set<string>();

/**
 * Autosave, complete, and undo share this queue so they never race: each
 * call reads the session as of its turn and only marks its own taps sent
 * once its own request has landed.
 */
let queue: Promise<void> = Promise.resolve();

/** Call when a brand new session begins, so a previous session's progress doesn't leak in. */
export function resetSaveProgress(): void {
	sentTapKeys = new Set();
	queue = Promise.resolve();
}

function buildPayload(s: SessionState, newTaps: SessionState['taps']) {
	return {
		sessionId: s.sessionId,
		taps: newTaps,
		totalCount: s.totalCount,
		weather: s.weather,
		weatherObservationId: s.weatherObservationId,
		condition: s.condition,
		notes: s.notes,
		windObserved: s.windObserved,
		otherCreatures: s.otherCreatures,
		focalArea: s.focalArea,
		lat: s.lat,
		lng: s.lng,
		durationMin: s.totalDurationMin,
		spaceId: s.spaceId,
		spotId: s.spotId,
		locality: s.locality,
		startedAt: s.startedAt,
		clockOffsetMs: s.clockOffsetMs
	};
}

async function send(url: string): Promise<Response | null> {
	const s = get(sessionStore);
	if (!s.sessionId) return null;

	const newTaps = s.taps.filter((t) => !sentTapKeys.has(t.tappedAt));
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(buildPayload(s, newTaps))
		});
		if (res.ok) {
			for (const t of newTaps) sentTapKeys.add(t.tappedAt);
			return res;
		}
	} catch {
		// offline — the next autosave/complete call retries with the same delta
	}
	return null;
}

/**
 * Persists progress so far: an upsert of the session row plus any taps not
 * already saved. Safe to call often — on every tap and on an idle heartbeat.
 */
export function autosaveSession(): Promise<void> {
	const result = queue.then(() => send('/api/sessions/autosave')).then(() => undefined);
	queue = result;
	return result;
}

export interface CompleteSessionResult {
	comparison: SpotSessionComparison | null;
}

/** Final save: same delta as autosave, but marks the session complete. */
export function completeSession(): Promise<CompleteSessionResult | null> {
	const result = queue
		.then(() => send('/api/sessions/complete'))
		.then((res) => (res ? res.json() : null)) as Promise<CompleteSessionResult | null>;
	queue = result.then(() => undefined);
	return result;
}

/**
 * Server-side half of the undo ("−") button (see ObserveStep.removeLastTap).
 * Called unconditionally on every undo — including for a tap that was still
 * only local, never autosaved yet — since the server-side delete is a no-op
 * in that case. Without this, undoing a tap that had already reached the
 * server left the row there forever: the observer's count went back down,
 * but nothing ever told the database.
 */
export function undoTap(insectName: string, spotId: number | null): Promise<void> {
	const result = queue.then(() => sendUndo(insectName, spotId)).then(() => undefined);
	queue = result;
	return result;
}

async function sendUndo(insectName: string, spotId: number | null): Promise<void> {
	const s = get(sessionStore);
	if (!s.sessionId) return;
	try {
		await fetch(`/api/sessions/${s.sessionId}/undo`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ insectName, spotId })
		});
	} catch {
		// best-effort — worst case a stale row survives, the same failure mode this exists to fix
	}
}
