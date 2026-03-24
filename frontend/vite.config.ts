import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
	envDir: '..',
	plugins: [tailwindcss(), sveltekit()],
	resolve: {
		alias: {
			// The module_bindings are outside frontend/ and import 'spacetimedb' bare.
			// Point the bare specifier at the copy inside frontend/node_modules so Vite
			// (and Rollup) can resolve it during both dev and build.
			spacetimedb: path.resolve('./node_modules/spacetimedb')
		}
	},
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node',
		alias: {
			$env: new URL('./tests/__mocks__/env.ts', import.meta.url).pathname,
			'$env/static/public': new URL('./tests/__mocks__/env.ts', import.meta.url).pathname
		}
	}
});
