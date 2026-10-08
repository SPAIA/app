/** The "Welcher Ort ist dir wichtig?" choices on /ort. Ids are stored in spots/email_signups.place_type. */
export const PLACE_TYPES = [
	{ id: 'garten', label: 'Garten', emoji: '🌻' },
	{ id: 'balkon', label: 'Balkon', emoji: '🪴' },
	{ id: 'schulhof', label: 'Schulhof', emoji: '🏫' },
	{ id: 'innenhof', label: 'Innenhof', emoji: '🏘️' },
	{ id: 'anderer', label: 'Anderer Ort', emoji: '📍' }
] as const;

export type PlaceType = (typeof PLACE_TYPES)[number]['id'];

export function isPlaceType(value: unknown): value is PlaceType {
	return PLACE_TYPES.some((p) => p.id === value);
}
