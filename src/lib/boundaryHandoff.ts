/**
 * Hands a boundary draft off to the fullscreen /space/boundary editor and
 * carries the result back, via sessionStorage since the drawn GeoJSON can be
 * too large to comfortably round-trip through a URL query param.
 */

const DRAFT_KEY = 'spaia:boundary-draft';
const RESULT_KEY = 'spaia:boundary-result';

export interface BoundaryDraft {
	lat: number | null;
	lng: number | null;
	geojson: string | null;
	returnTo: string;
}

export interface BoundaryResult {
	geojson: string | null;
	areaM2: number;
	/** Center of the drawn shape, so the pin can be moved to match. Null if nothing was drawn. */
	lat: number | null;
	lng: number | null;
}

export function setBoundaryDraft(draft: BoundaryDraft): void {
	sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

/** Reads and clears the pending draft, so a later reload of the editor doesn't reapply it. */
export function takeBoundaryDraft(): BoundaryDraft | null {
	const raw = sessionStorage.getItem(DRAFT_KEY);
	if (!raw) return null;
	sessionStorage.removeItem(DRAFT_KEY);
	try {
		return JSON.parse(raw) as BoundaryDraft;
	} catch {
		return null;
	}
}

export function setBoundaryResult(result: BoundaryResult): void {
	sessionStorage.setItem(RESULT_KEY, JSON.stringify(result));
}

/** Reads and clears the pending result, so navigating back again doesn't reapply it. */
export function takeBoundaryResult(): BoundaryResult | null {
	const raw = sessionStorage.getItem(RESULT_KEY);
	if (!raw) return null;
	sessionStorage.removeItem(RESULT_KEY);
	try {
		return JSON.parse(raw) as BoundaryResult;
	} catch {
		return null;
	}
}
