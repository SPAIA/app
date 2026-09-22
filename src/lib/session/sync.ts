import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { sessionStore } from '$lib/stores/session';
import { toSnapshot, saveLocalSnapshot, removeLocalSnapshot, type SessionSnapshot } from './snapshot';

/**
 * The entire client-side persistence lifecycle for an observation:
 * local state -> localStorage (immediate) -> server snapshot (every 30s, or
 * immediately on completion). See $lib/session/snapshot.ts for the shape and
 * local storage, and PUT /api/sessions/[id] for the idempotent server side.
 */
const SYNC_INTERVAL_MS = 30000;

/** The JSON of the last snapshot the server confirmed it has. Comparing against this is the "has state changed" check. */
let lastSyncedJSON: string | null = null;
/** Only one PUT in flight at a time — a change mid-request waits for the next tick rather than racing it. */
let syncInFlight: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function markPending(): void {
	sessionStore.update((s) => ({ ...s, syncStatus: 'pending' }));
}

function markSynced(): void {
	sessionStore.update((s) => ({ ...s, syncStatus: 'synced' }));
}

function markSyncError(): void {
	sessionStore.update((s) => ({ ...s, syncStatus: 'error' }));
}

/** Saves the current session state to localStorage right away. Call on every meaningful state change (tap, undo, notes, condition, spot, ...). */
export function persistLocal(): void {
	// Bumping revision here, in lockstep with every meaningful change, is what
	// lets the server tell a genuinely newer snapshot apart from a stale one
	// that arrives out of order — see syncSessionSnapshot.
	sessionStore.update((s) => ({ ...s, revision: s.revision + 1 }));
	const snapshot = toSnapshot(get(sessionStore));
	if (snapshot) saveLocalSnapshot(snapshot);
}

/** Clears sync bookkeeping for a brand new session, so a previous session's "already synced" state doesn't leak in. */
export function resetSyncProgress(): void {
	lastSyncedJSON = null;
	syncInFlight = null;
}

async function putSnapshot(snapshot: SessionSnapshot, json: string): Promise<Response> {
	return fetch(`/api/sessions/${snapshot.id}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: json
	});
}

function syncSnapshot(snapshot: SessionSnapshot, json: string): Promise<void> {
	if (syncInFlight) return syncInFlight;

	markPending();
	const attempt = (async () => {
		try {
			const res = await putSnapshot(snapshot, json);
			if (!res.ok) throw new Error(`sync failed: ${res.status}`);

			// Only this snapshot's own request may confirm it as synced — if local
			// state has moved on since this request was sent, the response is
			// stale: leave lastSyncedJSON alone so the next tick resends the
			// current state instead of wrongly marking it caught up.
			const current = toSnapshot(get(sessionStore));
			if (current && JSON.stringify(current) === json) {
				lastSyncedJSON = json;
				if (snapshot.status === 'complete') removeLocalSnapshot(snapshot.id);
				markSynced();
			}
		} catch {
			markSyncError();
		} finally {
			syncInFlight = null;
		}
	})();
	syncInFlight = attempt;
	return attempt;
}

/** Sends the current snapshot only if it differs from what the server last confirmed. */
function syncIfDirty(): Promise<void> {
	const snapshot = toSnapshot(get(sessionStore));
	if (!snapshot) return Promise.resolve();
	const json = JSON.stringify(snapshot);
	if (json === lastSyncedJSON) return Promise.resolve();
	return syncSnapshot(snapshot, json);
}

/** Forces an immediate sync regardless of the 30s timer — used right after starting a session (so the row exists before the photo upload) and on completion. */
export function syncNow(): Promise<void> {
	const snapshot = toSnapshot(get(sessionStore));
	if (!snapshot) return Promise.resolve();
	return syncSnapshot(snapshot, JSON.stringify(snapshot));
}

/** Marks the session complete locally, persists it, and attempts an immediate final sync. Safe to call again if the previous attempt never got a response. */
export async function completeSessionSync(): Promise<void> {
	sessionStore.update((s) => ({ ...s, status: 'complete' }));
	persistLocal();
	await syncNow();
}

/** Starts the 30s background sync while an observation is active. Call once when the observe page mounts; pair with stopSessionSync on unmount. */
export function startSessionSync(): void {
	stopSessionSync();
	timer = setInterval(() => void syncIfDirty(), SYNC_INTERVAL_MS);
	if (browser) document.addEventListener('visibilitychange', onVisibilityChange);
}

export function stopSessionSync(): void {
	if (timer) clearInterval(timer);
	timer = null;
	if (browser) document.removeEventListener('visibilitychange', onVisibilityChange);
}

// Best-effort only — correctness comes from local persistence + the 30s
// timer + startup recovery, not from catching every backgrounding event.
function onVisibilityChange(): void {
	if (document.visibilityState === 'hidden') void syncIfDirty();
}
