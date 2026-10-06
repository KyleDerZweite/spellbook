import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const forbidden = [
	'@spellbook/backend',
	'/backend/src/',
	'drizzle-orm',
	'node:crypto',
	'DATABASE_URL',
	'local_credentials',
	'auth_sessions',
	'catalog_printings',
	'scrypt$'
];
export function checkClient(directory) {
	if (!existsSync(directory))
		throw new Error('Build client output before checking its dependency boundary.');
	const errors = [];
	function visit(path) {
		for (const entry of readdirSync(path, { withFileTypes: true })) {
			const file = join(path, entry.name);
			if (entry.isDirectory()) visit(file);
			else if (/\.(js|map)$/.test(file)) {
				const text = readFileSync(file, 'utf8');
				for (const token of forbidden) if (text.includes(token)) errors.push({ file, token });
			}
		}
	}
	visit(directory);
	return errors;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const directory = resolve(
		dirname(fileURLToPath(import.meta.url)),
		'../frontend/.svelte-kit/output/client'
	);
	const errors = checkClient(directory);
	for (const { file, token } of errors)
		console.error(`Server token ${token} in client file ${file}`);
	if (errors.length) process.exitCode = 1;
	else console.log('Built client contains no backend, persistence or credential code.');
}
