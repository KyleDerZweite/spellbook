import { loadEnv } from 'vite';
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const mockPath = (relativePath: string) => new URL(relativePath, import.meta.url).pathname;

export default defineConfig(({ mode, command }) => ({
	envDir: '.',
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter(),
			// The web hook checks form origins; the API validates proxied mutations.
			csrf: { trustedOrigins: ['*'] },
			env: { dir: '.' },
			paths: {
				origin:
					command === 'serve'
						? process.env.DEV_APP_ORIGIN?.trim() ||
							loadEnv(mode, '.', '').DEV_APP_ORIGIN?.trim() ||
							'http://localhost:5173'
						: process.env.APP_ORIGIN?.trim() ||
							loadEnv(mode, '.', '').APP_ORIGIN?.trim() ||
							undefined
			}
		})
	],
	resolve: {
		alias: process.env.VITEST
			? [
					{
						find: '#lib/env/private.ts',
						replacement: mockPath('./tests/__mocks__/env-private.ts')
					}
				]
			: []
	},
	test: {
		environment: 'node',
		projects: [
			{
				extends: true,
				test: {
					name: 'performance',
					include: ['tests/browsing-performance.test.ts'],
					fileParallelism: false,
					testTimeout: 600_000,
					hookTimeout: 600_000
				}
			},
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['tests/unit/**/*.test.ts']
				}
			},
			{
				extends: true,
				test: {
					name: 'integration',
					// These files publish one shared Catalog generation in the disposable database.
					fileParallelism: false,
					include: ['tests/integration/**/*.test.ts'],
					testTimeout: 20_000
				}
			}
		]
	}
}));
