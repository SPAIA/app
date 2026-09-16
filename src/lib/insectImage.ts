// insect_types.name -> static/spaia_emoji filename.
const FILENAME_BY_NAME: Record<string, string> = {
	Bees: 'bee',
	Butterflies: 'butterfly',
	Flies: 'fly',
	Beetles: 'beetle',
	Ants: 'ant',
	Wasps: 'wasp',
	Spiders: 'spider',
	Bugs: 'truebug',
	Grasshoppers: 'grasshopper',
	Dragonflies: 'dragonfly',
	Caterpillars: 'catepillar',
	Other: 'other-not-sure-separate'
};

export function insectImage(name: string): string {
	const slug = FILENAME_BY_NAME[name] ?? name.toLowerCase();
	return `/spaia_emoji/${slug}.png`;
}
