// insect_types.name -> static/bug_buttons filename; only "Flies" doesn't match name.toLowerCase().
const FILENAME_BY_NAME: Record<string, string> = {
	Flies: 'flys'
};

export function insectImage(name: string): string {
	const slug = FILENAME_BY_NAME[name] ?? name.toLowerCase();
	return `/bug_buttons/${slug}.png`;
}
