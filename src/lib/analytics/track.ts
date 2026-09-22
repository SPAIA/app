import { browser } from '$app/environment';

/** Random per-device id, distinct from the observation `sessions` table — just lets events from the same device be grouped. */
const VISITOR_KEY = 'spaia:visitorId';

function getVisitorId(): string | null {
	if (!browser) return null;
	try {
		let id = localStorage.getItem(VISITOR_KEY);
		if (!id) {
			id = crypto.randomUUID();
			localStorage.setItem(VISITOR_KEY, id);
		}
		return id;
	} catch {
		return null;
	}
}

/** Fire-and-forget analytics event. Never blocks or throws — a dropped event is fine. */
export function track(name: string, props?: Record<string, unknown>): void {
	if (!browser) return;

	const body = JSON.stringify({
		name,
		path: location.pathname,
		visitorId: getVisitorId(),
		props: props ?? null
	});

	try {
		if (navigator.sendBeacon?.('/api/events', new Blob([body], { type: 'application/json' }))) return;
		fetch('/api/events', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body,
			keepalive: true
		}).catch(() => {
			// offline or blocked — this event is just lost, no retry
		});
	} catch {
		// non-fatal
	}
}
