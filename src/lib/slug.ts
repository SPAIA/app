export function slugify(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Slugifies `name`, appending -2, -3, ... until `isTaken` says it's free. */
export async function uniqueSlug(name: string, isTaken: (slug: string) => Promise<boolean>): Promise<string> {
	const base = slugify(name) || 'spot';
	let slug = base;
	let n = 2;
	while (await isTaken(slug)) {
		slug = `${base}-${n}`;
		n++;
	}
	return slug;
}
