import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit()
	],
	server: {
		watch: {
			// Local D1/R2 live here; their SQLite WAL/SHM files change on every
			// DB read, which would otherwise trigger an endless full-reload loop.
			ignored: ['**/.wrangler/**']
		}
	}
});
