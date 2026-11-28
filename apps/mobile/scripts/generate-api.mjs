import { readFile, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';

const source = new URL('../../../contracts/openapi.json', import.meta.url);
const contract = JSON.parse(await readFile(source, 'utf8'));
const routes = {
	'/api/v1/auth/login': ['post'],
	'/api/v1/auth/logout': ['post'],
	'/api/v1/auth/session': ['get'],
	'/api/v1/auth/qr/requests': ['post'],
	'/api/v1/auth/qr/token': ['post'],
	'/api/v1/mtg/catalog/search': ['get'],
	'/api/v1/mtg/catalog/printings/{printingId}': ['get'],
	'/api/v1/mtg/catalog/cards/{oracleId}/printings': ['get'],
	'/api/v1/mtg/inventory': ['get', 'post'],
	'/api/v1/mtg/inventory/{entryId}': ['patch', 'delete'],
	'/api/v1/mtg/inventory/groups': ['get'],
	'/api/v1/mtg/physical-boxes': ['get'],
	'/api/v1/mtg/deck-library': ['get'],
	'/api/v1/mtg/decks/{deckId}': ['get'],
	'/api/v1/mtg/scan/sessions': ['post'],
	'/api/v1/mtg/scan/sessions/{sessionId}/frames': ['post']
};

const paths = {};
const schemas = {};
function includeReferences(value) {
	if (!value || typeof value !== 'object') return;
	const prefix = '#/components/schemas/';
	if (value.$ref?.startsWith(prefix)) {
		const name = value.$ref.slice(prefix.length);
		if (!(name in schemas)) {
			schemas[name] = contract.components.schemas[name];
			if (!schemas[name]) throw new Error(`Missing schema: ${name}`);
			includeReferences(schemas[name]);
		}
	}
	for (const child of Object.values(value)) includeReferences(child);
}

for (const [route, methods] of Object.entries(routes)) {
	const source = contract.paths[route];
	if (!source) throw new Error(`Missing route: ${route}`);
	const path = source.parameters ? { parameters: source.parameters } : {};
	for (const method of methods) {
		if (!source[method]) throw new Error(`Missing operation: ${method} ${route}`);
		path[method] = source[method];
	}
	paths[route] = path;
	includeReferences(path);
}

const output = new URL('../src/api.generated.ts', import.meta.url);
const ast = await openapiTS(
	{
		...contract,
		paths,
		components: { ...contract.components, schemas }
	},
	{ silent: true }
);
const generated =
	'// Generated from contracts/openapi.json by npm run generate:api.\n' + astToString(ast);
if (process.argv.includes('--check')) {
	if ((await readFile(output, 'utf8')) !== generated) {
		throw new Error('Run npm run generate:api and commit the updated API types.');
	}
} else {
	await writeFile(output, generated);
}
