import { browser } from '$app/environment';

/**
 * Session ids this device has created, kept anonymously in localStorage so
 * that once the observer signs in (on any page, not just the one they
 * observed on) those anon-owned sessions can be reassigned to their account.
 * See /api/sessions/claim-local + claimSessionsByIds.
 */
const KEY = 'spaia:sessionIds';
const MAX_TRACKED = 50;

export function trackLocalSessionId(id: string): void {
	if (!browser) return;
	try {
		const ids = readLocalSessionIds();
		if (!ids.includes(id)) {
			localStorage.setItem(KEY, JSON.stringify([...ids, id].slice(-MAX_TRACKED)));
		}
	} catch {
		// localStorage unavailable (private mode, quota, etc.) — non-fatal
	}
}

export function readLocalSessionIds(): string[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(KEY);
		return raw ? (JSON.parse(raw) as string[]) : [];
	} catch {
		return [];
	}
}

export function clearLocalSessionIds(): void {
	if (!browser) return;
	try {
		localStorage.removeItem(KEY);
	} catch {
		// ignore
	}
}
