import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createMedia, getMediaForEntity } from '$lib/server/db/media';
import { getImageDimensions } from '$lib/media/imageDimensions';
import type { MediaEntityType, MediaType } from '$lib/types';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ENTITY_TYPES: MediaEntityType[] = ['space', 'spot', 'profile', 'session', 'sighting'];
const MEDIA_TYPES: MediaType[] = ['header_image', 'gallery', 'thumbnail', 'avatar'];

// List media attached to a given entity, e.g. /api/media?entity_type=space&entity_id=3
export const GET: RequestHandler = async ({ url, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');

	const entityType = url.searchParams.get('entity_type') as MediaEntityType | null;
	const entityId = url.searchParams.get('entity_id');
	if (!entityType || !ENTITY_TYPES.includes(entityType) || !entityId) {
		throw error(400, 'entity_type and entity_id are required');
	}

	const media = await getMediaForEntity(db, entityType, entityId);
	return json({ media });
};

// Upload a photo and attach it to an entity in one call.
export const POST: RequestHandler = async ({ request, locals, platform }) => {
	const bucket = platform?.env?.MEDIA;
	const db = platform?.env?.DB;
	if (!bucket || !db) throw error(503, 'Storage unavailable');

	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const form = await request.formData();

	const file = form.get('file');
	if (!(file instanceof File)) throw error(400, 'No file provided');
	if (!ALLOWED_TYPES.includes(file.type)) throw error(415, 'Unsupported image type');
	if (file.size > MAX_BYTES) throw error(413, 'Image too large (max 10 MB)');

	const entityType = form.get('entity_type') as MediaEntityType | null;
	const entityId = form.get('entity_id');
	if (!entityType || !ENTITY_TYPES.includes(entityType) || typeof entityId !== 'string' || !entityId) {
		throw error(400, 'entity_type and entity_id are required');
	}

	const mediaTypeRaw = form.get('media_type');
	const mediaType = (typeof mediaTypeRaw === 'string' && MEDIA_TYPES.includes(mediaTypeRaw as MediaType)
		? mediaTypeRaw
		: 'gallery') as MediaType;

	const label = (form.get('label') as string | null) || null;
	const notes = (form.get('notes') as string | null) || null;
	const attribution = (form.get('attribution') as string | null) || null;
	const altText = (form.get('alt_text') as string | null) || null;

	const bytes = await file.arrayBuffer();
	const dimensions = getImageDimensions(bytes, file.type);

	const id = crypto.randomUUID();
	await bucket.put(id, bytes, { httpMetadata: { contentType: file.type } });

	await createMedia(db, {
		id,
		entity_type: entityType,
		entity_id: entityId,
		media_type: mediaType,
		r2_key: id,
		mime_type: file.type,
		bytes: file.size,
		width: dimensions?.width ?? null,
		height: dimensions?.height ?? null,
		label,
		notes,
		attribution,
		alt_text: altText,
		uploaded_by: user.id
	});

	return json({
		id,
		url: `/api/media/${id}`,
		width: dimensions?.width ?? null,
		height: dimensions?.height ?? null
	});
};
