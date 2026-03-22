import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    alias: {
      '$env/static/public': path.resolve('./tests/__mocks__/env.ts'),
      '$lib': path.resolve('./src/lib'),
    },
  },
});
