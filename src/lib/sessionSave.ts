import { get } from 'svelte/store';
import { sessionStore, type SessionState } from './stores/session';
import type { SpotSessionComparison } from './types';

/** How many taps have already been persisted server-side, so a save only sends the delta. */
let savedTapCount = 0;

/**
 * Autosave and the final complete-save share this queue so they never race:
 * each call reads `savedTapCount` as of its turn and only advances it once
 * its own request has landed.
 */
let queue: Promise<void> = Promise.resolve();

/** Call when a brand new session begins, so a previous session's progress doesn't leak in. */
export function resetSaveProgress(): void {
	savedTapCount = 0;
	queue = Promise.resolve();
}

function buildPayload(s: SessionState, newTaps: SessionState['taps']) {
	return {
		sessionId: s.sessionId,
		taps: newTaps,
		totalCount: s.totalCount,
		weather: s.weather,
		condition: s.condition,
		focalArea: s.focalArea,
		lat: s.lat,
		lng: s.lng,
		durationMin: s.totalDurationMin,
		spaceId: s.spaceId,
		spotId: s.spotId,
		spotName: s.spotName,
		locality: s.locality,
		startedAt: s.startedAt,
		clockOffsetMs: s.clockOffsetMs
	};
}

async function send(url: string): Promise<Response | null> {
	const s = get(sessionStore);
	if (!s.sessionId) return null;

	const newTaps = s.taps.slice(savedTapCount);
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(buildPayload(s, newTaps))
		});
		if (res.ok) {
			savedTapCount = s.taps.length;
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
