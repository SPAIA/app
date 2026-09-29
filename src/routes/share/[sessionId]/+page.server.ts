import type { PageServerLoad } from './$types';
import { getSessionById } from '$lib/server/db/sessions';
import { getSessionSightingsAggregated } from '$lib/server/db/sightings';
import { getMediaForEntity } from '$lib/server/db/media';
import type { D1Database } from '$lib/server/db/d1';
import { error } from '@sveltejs/kit';
import QRCode from 'qrcode';

export const load: PageServerLoad = async ({ params, platform, url }) => {
	const db = platform?.env?.DB as D1Database | undefined;
	if (!db) throw error(503, 'Database unavailable');

	const session = await getSessionById(db, params.sessionId);
	if (!session) throw error(404, 'Session not found');

	// One row per species (count summed), not one row per tap — see
	// getSessionSightingsAggregated. The raw per-tap rows are what caused the
	// stats/pills on this page not to add up: every tap has its own row with
	// count always 1, so "types found" was actually showing total taps.
	const sightings = await getSessionSightingsAggregated(db, params.sessionId);
	const media = await getMediaForEntity(db, 'session', params.sessionId);
	const image = media[0] ?? null;

	// SVG rather than a PNG data URL: node-qrcode's PNG path needs canvas/zlib,
	// the SVG path is pure JS and runs on Workers. Rendered as an <img> so
	// html2canvas picks it up in "save as image".
	const qrSvg = await QRCode.toString(`${url.origin}${url.pathname}`, {
		type: 'svg',
		margin: 0,
		errorCorrectionLevel: 'M',
		color: { dark: '#0C2464', light: '#FFFFFF' }
	});
	const qrDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`;

	// Picked up by the root layout's og tags in place of the site defaults.
	const ogImage = image ? `${url.origin}/api/media/${image.id}` : null;
	const ogTitle = `SPAIA: ${session.total_count} insects in ${session.duration_min} min`;
	const ogDescription =
		`Spotted ${session.total_count} ${session.total_count === 1 ? 'insect' : 'insects'}` +
		` of ${sightings.length} ${sightings.length === 1 ? 'kind' : 'kinds'}` +
		(session.locality ? ` in ${session.locality}` : '') +
		` in ${session.duration_min} minutes. Try SPAIA — turn a walk into a wildlife count.`;

	return { session, sightings, image, qrDataUrl, ogImage, ogTitle, ogDescription };
};
