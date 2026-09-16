import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteLastSighting, decrementSpotInsectCount } from '$lib/db/queries';

interface UndoBody {
	insectName: string;
	spotId: number | null;
}

// Server-side half of the undo ("−") button on the count screen — see
// ObserveStep.removeLastTap. Called on every undo tap, regardless of
// whether the tap being undone had actually reached the server yet (delta
// autosave can lag a few seconds behind taps); deleteLastSighting is a
// no-op when there's nothing there to remove.
export const POST: RequestHandler = async ({ params, request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');

	const sessionId = params.id;
	const body = (await request.json()) as Partial<UndoBody>;
	const insectName = body.insectName?.trim();
	if (!insectName) throw error(400, 'insectName is required');

	const deleted = await deleteLastSighting(db, sessionId, insectName);
	if (deleted && body.spotId) {
		await decrementSpotInsectCount(db, body.spotId, insectName);
	}

	return json({ ok: true });
};
