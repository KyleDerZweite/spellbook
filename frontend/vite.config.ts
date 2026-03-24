import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	envDir: '..',
	plugins: [tailwindcss(), sveltekit()],
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node',
		alias: {
			$env: new URL('./tests/__mocks__/env.ts', import.meta.url).pathname,
			'$env/static/public': new URL('./tests/__mocks__/env.ts', import.meta.url).pathname
		}
	}
});
