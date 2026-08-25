import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Upload (or replace) the signed-in user's avatar. Stored in R2 under the user
// id so each user has exactly one avatar object.
export const POST: RequestHandler = async ({ request, locals, platform }) => {
	const bucket = platform?.env?.AVATARS;
	if (!bucket) throw error(503, 'Storage unavailable');

	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) throw error(400, 'No file provided');
	if (!ALLOWED.includes(file.type)) throw error(415, 'Unsupported image type');
	if (file.size > MAX_BYTES) throw error(413, 'Image too large (max 5 MB)');

	await bucket.put(user.id, await file.arrayBuffer(), {
		httpMetadata: { contentType: file.type }
	});

	// Cache-busting query so the browser refetches after replace.
	return json({ url: `/api/avatar/${user.id}?t=${Date.now()}` });
};
