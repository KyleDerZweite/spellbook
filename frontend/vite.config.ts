import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const mockPath = (relativePath: string) => new URL(relativePath, import.meta.url).pathname;

export default defineConfig({
	envDir: '..',
	plugins: [tailwindcss(), sveltekit()],
	resolve: {
		alias: [
			...(process.env.VITEST
				? [
						{
							find: '$env/static/public',
							replacement: mockPath('./tests/__mocks__/env.ts')
						},
						{
							find: '$env/dynamic/public',
							replacement: mockPath('./tests/__mocks__/env-dynamic.ts')
						},
						{
							find: '$env/static/private',
							replacement: mockPath('./tests/__mocks__/env-private.ts')
						},
						{
							find: '$env/dynamic/private',
							replacement: mockPath('./tests/__mocks__/env-private.ts')
						}
					]
				: [])
		]
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
});
