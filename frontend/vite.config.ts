import { loadEnv } from 'vite';
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const mockPath = (relativePath: string) => new URL(relativePath, import.meta.url).pathname;

export default defineConfig(({ mode }) => ({
	envDir: '..',
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter(),
			// The first server hook checks form origins and permits native bearer scan uploads.
			csrf: { trustedOrigins: ['*'] },
			env: { dir: '..' },
			paths: { origin: loadEnv(mode, '..', '').APP_ORIGIN?.trim() || undefined }
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
					name: 'unit',
					include: ['tests/unit/**/*.test.ts']
				}
			},
			{
				extends: true,
				test: {
					name: 'integration',
					include: ['tests/integration/**/*.test.ts'],
					testTimeout: 20_000
				}
			}
		]
	}
}));
