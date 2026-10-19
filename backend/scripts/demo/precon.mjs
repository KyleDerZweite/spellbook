import { readFile } from 'node:fs/promises';

export const precon = JSON.parse(
	await readFile(new URL('./upgrades-unleashed.json', import.meta.url), 'utf8')
);
