import { browser } from '$app/environment';

/**
 * Mirrors the payload sent to /api/sessions/autosave and /api/sessions/complete
 * (see $lib/sessionSave), kept in localStorage so an in-progress count survives
 * a crash, background-kill, or lost connection even before the server has it.
 */
export interface OfflineSessionPayload {
	sessionId: string;
	taps: { name: string; tappedAt: string }[];
	totalCount: number;
	weather: string | null;
	weatherObservationId: number | null;
	condition: string | null;
	notes: string | null;
	windObserved: string | null;
	otherCreatures: { creature: string; label: string | null }[];
	focalArea: string;
	lat: number | null;
	lng: number | null;
	durationMin: number;
	spaceId: number | null;
	spotId: number | null;
	locality: string | null;
	startedAt: string | null;
	clockOffsetMs: number;
	/** True once completeSession() had been called for this session — resync should finish it, not just autosave it. */
	completing: boolean;
}

const KEY = 'spaia:pendingSessions';
const MAX_TRACKED = 20;

function readAll(): Record<string, OfflineSessionPayload> {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(KEY);
		return raw ? (JSON.parse(raw) as Record<string, OfflineSessionPayload>) : {};
	} catch {
		return {};
	}
}

function writeAll(all: Record<string, OfflineSessionPayload>): void {
	if (!browser) return;
	try {
		localStorage.setItem(KEY, JSON.stringify(all));
	} catch {
		// localStorage unavailable (private mode, quota, etc.) — non-fatal, just means no offline backup
	}
}

export function saveOfflineSession(payload: OfflineSessionPayload): void {
	if (!browser) return;
	const all = readAll();
	all[payload.sessionId] = payload;
	// Oldest-first eviction if this device has an unreasonable backlog of abandoned sessions.
	const ids = Object.keys(all);
	if (ids.length > MAX_TRACKED) {
		for (const id of ids.slice(0, ids.length - MAX_TRACKED)) delete all[id];
	}
	writeAll(all);
}

export function removeOfflineSession(id: string): void {
	if (!browser) return;
	const all = readAll();
	if (!(id in all)) return;
	delete all[id];
	writeAll(all);
}

export function listOfflineSessions(): OfflineSessionPayload[] {
	return Object.values(readAll());
}
