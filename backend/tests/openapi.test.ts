import assert from 'node:assert/strict';
import test from 'node:test';
import { openapi } from '../src/http/openapi.ts';
import { PROFILE_ARTWORK_IDS, PROFILE_AVATAR_IDS } from '@spellbook/contracts/profile.ts';

test('the API schema preserves 82 legacy methods and documents the six new methods', () => {
	const schema = openapi('https://spellbook.example');
	const methods = Object.entries(schema.paths)
		.filter(([path]) => path.startsWith('/api/'))
		.flatMap(([, path]) =>
			Object.keys(path).filter((key) => ['get', 'post', 'patch', 'put', 'delete'].includes(key))
		);
	assert.equal(methods.length, 88);
	assert.deepEqual(schema.servers, [{ url: 'https://spellbook.example' }]);
	assert.deepEqual(schema.paths['/api/catalog/search'].get.security, []);
	assert.deepEqual(schema.paths['/api/catalog/search'].post.security, []);
	assert.deepEqual(schema.paths['/api/catalog/cards/{oracleId}/printings'].get.security, []);
	assert.deepEqual(schema.paths['/api/catalog/printings/{printingId}'].get.security, []);
	assert.ok(schema.paths['/api/mobile/v1/mtg/category-definitions/{originId}'].get);
});

test('web schema describes exactly nine strict intents without authority fields', () => {
	const command = openapi('https://spellbook.example').paths['/api/web/v1/commands'].post;
	const schema = command.requestBody!.content['application/json'].schema as {
		oneOf: Array<{
			additionalProperties: boolean;
			properties: {
				operation: { const: string };
				input: {
					additionalProperties: boolean;
					properties: Record<string, unknown>;
					required: string[];
				};
			};
		}>;
	};
	assert.deepEqual(schema.oneOf.map((value) => value.properties.operation.const).sort(), [
		'decks.addCatalogCard',
		'decks.changePrinting',
		'decks.createRecord',
		'decks.importInto',
		'decks.removeCard',
		'decks.updateCard',
		'inventory.add',
		'inventory.patchEntry',
		'inventory.remove'
	]);
	for (const value of schema.oneOf) {
		assert.equal(value.additionalProperties, false);
		assert.equal(value.properties.input.additionalProperties, false);
		for (const key of ['actor', 'accountId', 'source', 'application'])
			assert.equal(key in value.properties.input.properties, false);
	}
	const patch = schema.oneOf.find(
		(value) => value.properties.operation.const === 'inventory.patchEntry'
	)!;
	assert.deepEqual(patch.properties.input.required, ['requestId', 'entryId']);
});

test('all schema references resolve and profile IDs come from pure contracts', () => {
	const schema = openapi('https://spellbook.example');
	function inspect(value: unknown): void {
		if (!value || typeof value !== 'object') return;
		for (const [key, child] of Object.entries(value)) {
			if (key === '$ref' && typeof child === 'string') {
				const name = child.replace('#/components/schemas/', '');
				assert.ok(name in schema.components.schemas, `Missing schema ${name}`);
			} else inspect(child);
		}
	}
	inspect(schema);
	const properties = schema.components.schemas.ProfileUser.properties;
	assert.ok(properties && typeof properties === 'object');
	assert.ok('avatarId' in properties && 'artworkId' in properties);
	assert.deepEqual(properties.avatarId, { enum: PROFILE_AVATAR_IDS });
	assert.deepEqual(properties.artworkId, { enum: PROFILE_ARTWORK_IDS });
});

test('three fixed web form routes preserve form media types, Origin and safe response schemas', () => {
	const schema = openapi('https://spellbook.example');
	for (const path of [
		'/api/web/v1/auth/login',
		'/api/web/v1/auth/register',
		'/api/web/v1/password'
	] as const) {
		const operation = schema.paths[path].post;
		assert.deepEqual(Object.keys(operation.requestBody.content).sort(), [
			'application/x-www-form-urlencoded',
			'multipart/form-data'
		]);
		assert.equal(operation.parameters[0].name, 'Origin');
		assert.equal(operation.parameters[0].required, true);
		assert.ok(operation.responses[400]);
		assert.ok(operation.responses[413]);
		assert.ok(operation.responses[415]);
	}
	assert.deepEqual(schema.components.schemas.WebLoginFormFailure.required, ['message', 'username']);
	assert.deepEqual(schema.components.schemas.WebRegisterFormFailure.required, [
		'message',
		'username',
		'artworkId'
	]);
	assert.deepEqual(schema.components.schemas.WebPasswordFormSuccess.allOf, [
		{ $ref: '#/components/schemas/PasswordSession' },
		{ type: 'object', properties: { success: { const: true } }, required: ['success'] }
	]);
	const methods = Object.values(schema.paths).flatMap((path) =>
		Object.keys(path).filter((method) => ['get', 'post', 'patch', 'put', 'delete'].includes(method))
	);
	assert.equal(methods.length, 95);
});
