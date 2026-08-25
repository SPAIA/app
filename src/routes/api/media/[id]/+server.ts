import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMediaById, deleteMedia } from '$lib/db/queries';

// Serve a media file straight from R2 through the Worker.
export const GET: RequestHandler = async ({ params, platform }) => {
	const bucket = platform?.env?.MEDIA;
	const db = platform?.env?.DB;
	if (!bucket || !db) throw error(503, 'Storage unavailable');

	const media = await getMediaById(db, params.id);
	if (!media) throw error(404, 'Not found');

	const object = await bucket.get(media.r2_key);
	if (!object) throw error(404, 'Not found');

	const headers = new Headers();
	headers.set('Content-Type', object.httpMetadata?.contentType ?? media.mime_type);
	// Short-lived cache: media can be deleted, and unlike the avatar endpoint
	// there's no fixed key to bust — an immutable cache would let deleted
	// photos keep serving from the edge for as long as it holds them.
	headers.set('Cache-Control', 'public, max-age=300');
	if (object.httpEtag) headers.set('ETag', object.httpEtag);

	return new Response(object.body as ReadableStream, { headers });
};

// Remove a media item — only the person who uploaded it may delete it.
export const DELETE: RequestHandler = async ({ params, locals, platform }) => {
	const bucket = platform?.env?.MEDIA;
	const db = platform?.env?.DB;
	if (!bucket || !db) throw error(503, 'Storage unavailable');

	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const media = await getMediaById(db, params.id);
	if (!media) throw error(404, 'Not found');
	if (media.uploaded_by !== user.id) throw error(403, 'Forbidden');

	await bucket.delete(media.r2_key);
	await deleteMedia(db, media.id);

	return json({ success: true });
};
