import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Serve an avatar straight from R2 through the Worker — no public bucket or
// extra domain required. Keys are user ids (set by the upload endpoint).
export const GET: RequestHandler = async ({ params, platform }) => {
	const bucket = platform?.env?.AVATARS;
	if (!bucket) throw error(503, 'Storage unavailable');

	const object = await bucket.get(params.key);
	if (!object) throw error(404, 'Not found');

	const headers = new Headers();
	headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream');
	headers.set('Cache-Control', 'public, max-age=300');
	if (object.httpEtag) headers.set('ETag', object.httpEtag);

	return new Response(object.body as ReadableStream, { headers });
};
