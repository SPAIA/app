export interface ReverseGeocodeResult {
	locality: string | null;
	country: string | null;
	/** City/town — distinct from `locality`, which can be a neighbourhood/suburb. */
	town: string | null;
	/** State/province. */
	region: string | null;
	postcode: string | null;
	/**
	 * GeoNames ids identifying the actual place behind each display string above,
	 * independent of the `localityLanguage` used to fetch it — re-geocoding the
	 * same point in another language yields different display strings but the
	 * same ids, so these are what should be compared/joined on, not the strings.
	 */
	countryGeonameId: number | null;
	regionGeonameId: number | null;
	townGeonameId: number | null;
	localityGeonameId: number | null;
}

interface BigDataCloudAdminEntry {
	name: string;
	order: number;
	geonameId?: number;
}

/**
 * BigDataCloud numbers every administrative + informative entry with a single
 * increasing `order` from country down to neighbourhood. Matching each display
 * string to the entry with that exact name, walking the merged list in order,
 * recovers the right geonameId even when two entries share a name (e.g. a
 * city-state's region and city entries, both called "Berlin").
 */
function resolveGeonameIds(data: {
	countryName?: string;
	principalSubdivision?: string;
	city?: string;
	locality?: string;
	localityInfo?: { administrative?: BigDataCloudAdminEntry[]; informative?: BigDataCloudAdminEntry[] };
}): Pick<ReverseGeocodeResult, 'countryGeonameId' | 'regionGeonameId' | 'townGeonameId' | 'localityGeonameId'> {
	const entries = [...(data.localityInfo?.administrative ?? []), ...(data.localityInfo?.informative ?? [])].sort(
		(a, b) => a.order - b.order
	);

	let cursor = -Infinity;
	function resolve(name: string | undefined | null): number | null {
		if (!name) return null;
		const match = entries.find((e) => e.order >= cursor && e.name === name);
		if (!match) return null;
		cursor = match.order + 1;
		return match.geonameId ?? null;
	}

	return {
		countryGeonameId: resolve(data.countryName),
		regionGeonameId: resolve(data.principalSubdivision),
		townGeonameId: resolve(data.city),
		localityGeonameId: resolve(data.locality)
	};
}

/**
 * Resolves GPS coordinates to locality + country + town/region/postcode via
 * BigDataCloud's free client-side reverse-geocoding endpoint.
 *
 * Must be called from the browser, not proxied through a server: BigDataCloud's
 * fair-use policy for this free endpoint requires calls to originate directly
 * from the client using the device's current location.
 */
export async function reverseGeocode(
	lat: number,
	lng: number
): Promise<ReverseGeocodeResult | null> {
	try {
		const res = await fetch(
			`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
		);
		if (!res.ok) return null;
		const data = (await res.json()) as {
			locality?: string;
			city?: string;
			countryName?: string;
			principalSubdivision?: string;
			postcode?: string;
			localityInfo?: { administrative?: BigDataCloudAdminEntry[]; informative?: BigDataCloudAdminEntry[] };
		};
		return {
			locality: data.locality || data.city || null,
			country: data.countryName || null,
			town: data.city || null,
			region: data.principalSubdivision || null,
			postcode: data.postcode || null,
			...resolveGeonameIds(data)
		};
	} catch {
		return null;
	}
}
