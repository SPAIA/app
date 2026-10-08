import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	FREE_HABITAT_SCANS,
	readHabitatScanCount,
	scoreHabitatPhoto,
	writeHabitatScanCount
} from '$lib/server/habitatScore';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — the client resizes to ~1600px first, so this is a backstop
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Public, stateless "how insect-friendly is this place?" check for /habitat.
// Nothing is stored: the photo goes to DeepSeek Vision and the score comes back.
// Anonymous visitors get FREE_HABITAT_SCANS successful scans; signed-in users are unlimited.
export const POST: RequestHandler = async ({ request, platform, locals, cookies }) => {
	const apiKey = platform?.env?.DEEPSEEK_API_KEY;
	if (!apiKey) throw error(503, 'Vision unavailable');

	const used = readHabitatScanCount(cookies);
	if (!locals.user && used >= FREE_HABITAT_SCANS) throw error(429, 'Free scans used up');

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) throw error(400, 'No file provided');
	if (!ALLOWED_TYPES.includes(file.type)) throw error(415, 'Unsupported image type');
	if (file.size > MAX_BYTES) throw error(413, 'Image too large (max 10 MB)');

	try {
		const result = await scoreHabitatPhoto({ apiKey, imageBytes: await file.arrayBuffer(), mimeType: file.type });
		// Only successful scans count — a failed call shouldn't cost the visitor a try.
		if (!locals.user) writeHabitatScanCount(cookies, used + 1);
		return json({
			result,
			scansLeft: locals.user ? null : Math.max(0, FREE_HABITAT_SCANS - used - 1)
		});
	} catch (err) {
		console.error('Habitat score failed', err);
		throw error(502, 'Vision failed');
	}
};
