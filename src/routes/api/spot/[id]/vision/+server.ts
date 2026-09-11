import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	deleteHabitatFeaturesForMedia,
	deletePlantObservationsForMedia,
	findOrCreatePlant,
	getSpotById,
	recordHabitatFeatures,
	recordPlantObservations,
	refreshSpotAiDescription
} from '$lib/db/queries';
import type { HabitatFeatureCategory, PlantRank, SpotVisionResult } from '$lib/types';

interface VisionEditBody {
	mediaId: string;
	plants: { name: string; rank: PlantRank }[];
	habitat_features: { category: HabitatFeatureCategory; label: string }[];
}

// Lets the user correct the AI-identified plants/habitat features for a photo
// before confirming a spot — replaces that photo's rows outright rather than
// diffing, since the client only ever holds the current, already-edited list.
export const PATCH: RequestHandler = async ({ params, request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');

	const spotId = Number(params.id);
	if (!Number.isFinite(spotId)) throw error(400, 'Invalid spot id');

	const spot = await getSpotById(db, spotId);
	if (!spot) throw error(404, 'Spot not found');

	const body = (await request.json()) as Partial<VisionEditBody>;
	const mediaId = body.mediaId?.trim();
	if (!mediaId) throw error(400, 'mediaId is required');

	const plants = (body.plants ?? []).filter((p) => p.name?.trim());
	const habitatFeatures = (body.habitat_features ?? []).filter((f) => f.label?.trim());

	await deleteHabitatFeaturesForMedia(db, spot.id, mediaId);
	await recordHabitatFeatures(db, { spotId: spot.id, mediaId, features: habitatFeatures, source: 'manual' });

	await deletePlantObservationsForMedia(db, spot.id, mediaId);
	const plantIds: number[] = [];
	for (const p of plants) {
		plantIds.push(await findOrCreatePlant(db, { name: p.name, rank: p.rank, language: 'en', source: 'manual' }));
	}
	await recordPlantObservations(db, {
		spotId: spot.id,
		mediaId,
		plants: plantIds.map((plantId) => ({ plantId, confidence: null })),
		source: 'manual'
	});

	const cached = spot.ai_description ? (JSON.parse(spot.ai_description) as SpotVisionResult) : null;
	const vision: SpotVisionResult = {
		name: cached?.name ?? spot.name,
		scene: cached?.scene ?? '',
		changes: cached?.changes ?? null,
		area_mismatch: cached?.area_mismatch ?? false,
		weather: cached?.weather ?? null,
		plants,
		habitat_features: habitatFeatures
	};
	await refreshSpotAiDescription(db, spot.id, JSON.stringify(vision));

	return json({ vision });
};
