import type { AnalyticsEngineDataset } from '@cloudflare/workers-types';

export interface AnalyticsEvent {
	name: string;
	path: string | null;
	visitorId: string | null;
	userId: string | null;
	props: Record<string, unknown> | null;
}

/**
 * Column order is fixed at write time and only ever addressable positionally
 * (blob1, blob2, ...) from the SQL API — add new fields at the end, never
 * insert in the middle, or old rows will be misread under the new names.
 */
export function logEvent(analytics: AnalyticsEngineDataset, event: AnalyticsEvent): void {
	analytics.writeDataPoint({
		indexes: [event.name],
		blobs: [event.path ?? '', event.visitorId ?? '', event.userId ?? '', event.props ? JSON.stringify(event.props) : ''],
		doubles: []
	});
}
