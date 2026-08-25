import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createMedia,
	findOrCreatePlant,
	getSpotById,
	getSpotBySlug,
	recordHabitatFeatures,
	recordPlantObservations,
	updateSpotVisionResult
} from '$lib/db/queries';
import { getImageDimensions } from '$lib/media/imageDimensions';
import { describeSpotPhoto } from '$lib/server/deepseekVision';
import { uniqueSlug } from '$lib/slug';
import type { SpotVisionResult } from '$lib/types';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Uploads a spot's defining photo, then asks DeepSeek Vision to read the scene
// (plants/habitat features/name) from it. The vision call is best-effort: if
// it fails or no API key is configured, the photo still saves and the spot
// keeps its placeholder name for the caller to fill in by hand.
export const POST: RequestHandler = async ({ params, request, locals, platform }) => {
	const bucket = platform?.env?.MEDIA;
	const db = platform?.env?.DB;
	if (!bucket || !db) throw error(503, 'Storage unavailable');

	const spotId = Number(params.id);
	if (!Number.isFinite(spotId)) throw error(400, 'Invalid spot id');

	const spot = await getSpotById(db, spotId);
	if (!spot) throw error(404, 'Spot not found');

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) throw error(400, 'No file provided');
	if (!ALLOWED_TYPES.includes(file.type)) throw error(415, 'Unsupported image type');
	if (file.size > MAX_BYTES) throw error(413, 'Image too large (max 10 MB)');

	const locality = (form.get('locality') as string | null) || null;

	const bytes = await file.arrayBuffer();
	const dimensions = getImageDimensions(bytes, file.type);

	const mediaId = crypto.randomUUID();
	await bucket.put(mediaId, bytes, { httpMetadata: { contentType: file.type } });

	await createMedia(db, {
		id: mediaId,
		entity_type: 'spot',
		entity_id: String(spotId),
		media_type: 'header_image',
		r2_key: mediaId,
		mime_type: file.type,
		bytes: file.size,
		width: dimensions?.width ?? null,
		height: dimensions?.height ?? null,
		label: null,
		notes: null,
		attribution: null,
		alt_text: null,
		uploaded_by: locals.user?.id ?? null
	});

	const media = { id: mediaId, url: `/api/media/${mediaId}`, width: dimensions?.width ?? null, height: dimensions?.height ?? null };

	const apiKey = platform?.env?.DEEPSEEK_API_KEY;
	if (!apiKey) {
		return json({ media, spot: { id: spot.id, slug: spot.slug, name: spot.name }, vision: null });
	}

	let vision: SpotVisionResult;
	try {
		vision = await describeSpotPhoto({
			apiKey,
			imageBytes: bytes,
			mimeType: file.type,
			lat: spot.lat,
			lng: spot.lng,
			locality
		});
	} catch (err) {
		console.error('DeepSeek Vision failed', err);
		return json({ media, spot: { id: spot.id, slug: spot.slug, name: spot.name }, vision: null });
	}

	await recordHabitatFeatures(db, {
		spotId: spot.id,
		mediaId,
		features: vision.habitat_features,
		source: 'deepseek_vision'
	});

	// Sequential, not Promise.all: two guesses resolving the same new name at
	// once could each miss the other's insert and create a duplicate plant.
	const plantIds: number[] = [];
	for (const p of vision.plants) {
		plantIds.push(await findOrCreatePlant(db, { name: p.name, rank: p.rank, language: 'en', source: 'deepseek_vision' }));
	}
	await recordPlantObservations(db, {
		spotId: spot.id,
		mediaId,
		plants: plantIds.map((plantId) => ({ plantId, confidence: null })),
		source: 'deepseek_vision'
	});

	const slug = await uniqueSlug(vision.name, (candidate) =>
		candidate === spot.slug ? Promise.resolve(false) : getSpotBySlug(db, candidate).then((s) => s !== null)
	);

	await updateSpotVisionResult(db, spot.id, {
		slug,
		name: vision.name,
		aiDescription: JSON.stringify(vision)
	});

	return json({ media, spot: { id: spot.id, slug, name: vision.name }, vision });
};
