import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProfile } from '$lib/server/db/profiles';
import { getAllSpotsForExport } from '$lib/server/db/spots';
import { getAllSessionsForExport } from '$lib/server/db/sessions';
import { getAllSightingsForExport, getJoinedObservationsForExport } from '$lib/server/db/sightings';
import { getAllWeatherObservationsForExport } from '$lib/server/db/weather';
import { toCsv } from '$lib/server/csv';

const EXPORTS = {
	spots: getAllSpotsForExport,
	sessions: getAllSessionsForExport,
	sightings: getAllSightingsForExport,
	weather_observations: getAllWeatherObservationsForExport,
	observations: getJoinedObservationsForExport
} as const;

type ExportTable = keyof typeof EXPORTS;

function isExportTable(value: string): value is ExportTable {
	return value in EXPORTS;
}

// Admin CSV export — same auth pattern as backfill-weather: DB available, signed in, admin role.
export const GET: RequestHandler = async ({ locals, platform, params }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');
	if (!locals.user) throw error(401, 'Sign in required');

	const profile = await getProfile(db, locals.user.id);
	if (profile?.role !== 'admin') throw error(403, 'Admin only');

	const table = params.table;
	if (!isExportTable(table)) throw error(404, 'Unknown export');

	const rows = await EXPORTS[table](db);
	const csv = toCsv(rows);
	const date = new Date().toISOString().slice(0, 10);

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${table}_${date}.csv"`
		}
	});
};
