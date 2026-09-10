// insect_types.name -> static/spaia-icons filename.
const FILENAME_BY_NAME: Record<string, string> = {
	Bees: 'bees',
	Butterflies: 'butterflies-moths',
	Flies: 'flies',
	Beetles: 'beetles',
	Ants: 'ants',
	Wasps: 'wasps',
	Spiders: 'spiders',
	Bugs: 'true-bugs',
	Grasshoppers: 'grasshoppers-crickets',
	Dragonflies: 'dragonflies-damselflies',
	Caterpillars: 'caterpillars-larvae',
	Other: 'other-not-sure'
};

export function insectImage(name: string): string {
	const slug = FILENAME_BY_NAME[name] ?? name.toLowerCase();
	return `/spaia-icons/${slug}.svg`;
}
