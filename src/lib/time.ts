import { browser } from '$app/environment';

/** ms to add to a local `Date.now()` to get server (NTP-disciplined UTC) time. */
let offsetMs = 0;
let synced = false;

interface TimeResponse {
	now: number;
}

/**
 * Estimate the offset between this device's clock and the server's clock,
 * SNTP-style: fire a few requests, keep the sample with the lowest round-trip
 * time (least uncertainty), and assume the server read its clock at the
 * round-trip midpoint.
 *
 * Why: the browser clock can be arbitrarily wrong, but Cloudflare's clock is
 * NTP-disciplined — as is the Raspberry Pi camera at the site. Correcting the
 * phone onto server time means observation taps line up with video frames after
 * the fact, with no phone-to-Pi connection needed. (NTP itself isn't reachable
 * from a browser, so this HTTP round-trip is the equivalent.)
 *
 * Accuracy is roughly half the best round-trip time — typically well under the
 * human tap-reaction latency it's being correlated against, so it's plenty.
 */
export async function syncClock(samples = 3): Promise<number> {
	if (!browser) return offsetMs;

	let best: { offset: number; rtt: number } | null = null;

	for (let i = 0; i < samples; i++) {
		const sent = Date.now();
		let res: Response;
		try {
			res = await fetch('/api/time', { cache: 'no-store' });
		} catch {
			continue; // offline / unreachable — keep whatever we already have
		}
		const received = Date.now();
		const { now: serverNow } = (await res.json()) as TimeResponse;

		const rtt = received - sent;
		const offset = serverNow - (sent + rtt / 2);

		if (!best || rtt < best.rtt) best = { offset, rtt };
	}

	if (best) {
		offsetMs = Math.round(best.offset);
		synced = true;
	}
	return offsetMs;
}

/** Offset (server − device) in ms. 0 until {@link syncClock} succeeds. */
export function clockOffsetMs(): number {
	return offsetMs;
}

/** Whether a sync has succeeded; if false, timestamps fall back to the raw device clock. */
export function isClockSynced(): boolean {
	return synced;
}

/** Server-aligned epoch ms (raw device clock if unsynced). */
export function now(): number {
	return Date.now() + offsetMs;
}

/** Server-aligned ISO timestamp. Use for anything that must line up with the site camera. */
export function nowISO(): string {
	return new Date(now()).toISOString();
}

/** A plain-language bucket for the local hour — context for the vision model, not for display. */
export function timeOfDayLabel(date: Date = new Date()): string {
	const hour = date.getHours();
	if (hour < 6) return 'night';
	if (hour < 9) return 'early morning';
	if (hour < 12) return 'morning';
	if (hour < 14) return 'midday';
	if (hour < 18) return 'afternoon';
	if (hour < 21) return 'evening';
	return 'night';
}
