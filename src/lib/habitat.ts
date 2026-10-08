/** One visible habitat feature the model picked out, e.g. { emoji: '🌸', text: 'Viele Blüten' }. */
export interface HabitatFeature {
	emoji: string;
	text: string;
}

/** The image-based habitat read shown on /habitat and /naturlabor. */
export interface HabitatRead {
	score: number;
	features: HabitatFeature[];
}

/**
 * Fixed bands rather than a model-written verdict, so the same score always
 * reads the same way.
 */
export function habitatSignal(score: number): string {
	if (score >= 70) return 'Starkes Habitat-Signal';
	if (score >= 40) return 'Mittleres Habitat-Signal';
	return 'Schwaches Habitat-Signal';
}
