import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { getSpotById } from '$lib/server/db/spots';
import { upsertDeviceReading } from '$lib/server/db/devices';

const ReadingSchema = z
	.object({
		deviceId: z.string().trim().min(1).max(100),
		spotId: z.coerce.number().int().positive(),
		insectCount: z.number().int().nonnegative(),
		trails: z.array(z.unknown()),
		startTime: z.iso.datetime({ offset: true }),
		endTime: z.iso.datetime({ offset: true }),
		// Optional on-device sensors. Bounds are physical sanity checks to
		// catch a faulty sensor or wrong units, not climate limits.
		/** °C */
		temperature: z.number().min(-60).max(80).nullish(),
		/** % relative humidity */
		humidity: z.number().min(0).max(100).nullish(),
		/** hPa, station pressure */
		pressure: z.number().min(300).max(1100).nullish()
	})
	.refine((r) => Date.parse(r.endTime) >= Date.parse(r.startTime), {
		message: 'endTime must not be before startTime',
		path: ['endTime']
	});

/** Constant-time over the digests, so response timing can't leak how much of the key matched. */
async function keysMatch(given: string, expected: string): Promise<boolean> {
	const encoder = new TextEncoder();
	const [a, b] = await Promise.all([
		crypto.subtle.digest('SHA-256', encoder.encode(given)),
		crypto.subtle.digest('SHA-256', encoder.encode(expected))
	]);
	const x = new Uint8Array(a);
	const y = new Uint8Array(b);
	let diff = 0;
	for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
	return diff === 0;
}

// Ingest endpoint for field devices mounted at a spot. Devices have no user
// session, so they authenticate with the shared DEVICE_API_KEY as a bearer
// token. Re-sending the same (deviceId, startTime) window overwrites rather
// than duplicates — see upsertDeviceReading.
export const POST: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');

	const apiKey = platform?.env?.DEVICE_API_KEY;
	if (!apiKey) throw error(503, 'Device ingest not configured');
	const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
	if (!token || !(await keysMatch(token, apiKey))) throw error(401, 'Invalid device key');

	const body = await request.json().catch(() => null);
	const parsed = ReadingSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Invalid reading', issues: z.flattenError(parsed.error).fieldErrors }, { status: 400 });
	}
	const reading = parsed.data;

	const spot = await getSpotById(db, reading.spotId);
	if (!spot || !spot.active) return json({ error: 'Unknown spot' }, { status: 404 });

	const id = await upsertDeviceReading(db, {
		device_id: reading.deviceId,
		spot_id: reading.spotId,
		insect_count: reading.insectCount,
		trails: reading.trails,
		// Normalised to UTC so string ordering in SQL matches time ordering.
		start_time: new Date(reading.startTime).toISOString(),
		end_time: new Date(reading.endTime).toISOString(),
		temperature_c: reading.temperature ?? null,
		relative_humidity_pct: reading.humidity ?? null,
		pressure_hpa: reading.pressure ?? null
	});

	return json({ ok: true, id }, { status: 201 });
};
