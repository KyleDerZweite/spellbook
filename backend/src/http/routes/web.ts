import type { WebCommand, WebCommandInputs } from '@spellbook/contracts/web.ts';
import type { HttpDependencies, HttpRoute } from '../types.ts';
import { requireMobileAuth } from '../auth.ts';
import { error, json, badRequestIfValidation } from '../errors.ts';
import { readJsonObject } from '../request.ts';

type Field<T> = undefined extends T
	? Exclude<T, undefined> extends number
		? 'number?'
		: 'string?'
	: T extends number
		? 'number'
		: 'string';

// Only wire types are checked here. Domain validation and fingerprints stay in the use cases.
const fields: {
	[K in keyof WebCommandInputs]: {
		[P in keyof WebCommandInputs[K]]-?: Field<WebCommandInputs[K][P]>;
	};
} = {
	'inventory.add': {
		requestId: 'string',
		catalogCardId: 'string',
		finish: 'string',
		condition: 'string',
		quantity: 'number',
		notes: 'string?',
		notesRevision: 'string?'
	},
	'inventory.patchEntry': {
		requestId: 'string',
		entryId: 'string',
		quantity: 'number?',
		delta: 'number?',
		notes: 'string?',
		notesRevision: 'string?'
	},
	'inventory.remove': {
		requestId: 'string',
		entryId: 'string',
		expectedQuantity: 'number'
	},
	'decks.createRecord': {
		game: 'string',
		name: 'string',
		description: 'string',
		format: 'string'
	},
	'decks.addCatalogCard': {
		deckId: 'string',
		catalogCardId: 'string',
		quantity: 'number',
		role: 'string',
		requestId: 'string'
	},
	'decks.changePrinting': {
		entryId: 'string',
		catalogCardId: 'string',
		quantity: 'number',
		role: 'string',
		requestId: 'string',
		categoryPreview: 'string?'
	},
	'decks.updateCard': {
		entryId: 'string',
		quantity: 'number?',
		role: 'string?',
		requestId: 'string',
		delta: 'number?',
		categoryPreview: 'string?'
	},
	'decks.removeCard': { entryId: 'string', requestId: 'string' },
	'decks.importInto': { deckId: 'string', text: 'string', requestId: 'string' }
};

function readCommand(body: Record<string, unknown>): WebCommand {
	if (Object.keys(body).some((key) => key !== 'operation' && key !== 'input'))
		error(400, 'Unsupported web command fields');
	const { operation, input } = body;
	if (typeof operation !== 'string' || !Object.hasOwn(fields, operation))
		error(400, 'Unsupported web command operation');
	if (!input || typeof input !== 'object' || Array.isArray(input))
		error(400, 'Web command input must be an object');
	const schema = fields[operation as keyof WebCommandInputs];
	const values = input as Record<string, unknown>;
	if (Object.keys(values).some((key) => !Object.hasOwn(schema, key)))
		error(400, 'Unsupported web command input fields');
	for (const [key, type] of Object.entries(schema)) {
		if (!Object.hasOwn(values, key) && type.endsWith('?')) continue;
		if (type.startsWith('number')) {
			if (typeof values[key] !== 'number' || !Number.isFinite(values[key]))
				error(400, `${key} must be a finite number`);
		} else if (typeof values[key] !== 'string') error(400, `${key} must be a string`);
	}
	if (operation === 'decks.createRecord' && values.game !== 'mtg')
		error(400, 'Only mtg is supported');
	// Return the validated input intact: absent fields and retry payloads must stay absent.
	return { operation, input } as WebCommand;
}

export function createWebRoutes(deps: HttpDependencies): HttpRoute[] {
	const { application } = deps;
	return [
		{
			method: 'POST',
			path: '/api/web/v1/commands',
			handle: async (context) => {
				const { user } = await requireMobileAuth(context, deps);
				const command = readCommand(await readJsonObject(context.request, 1024 * 1024));
				try {
					switch (command.operation) {
						case 'inventory.add':
							return json(
								await application.inventory.add(user, { ...command.input, source: 'web' })
							);
						case 'inventory.patchEntry':
							return json(
								await application.inventory.patchEntry(user, { ...command.input, source: 'web' })
							);
						case 'inventory.remove':
							return json(
								await application.inventory.remove(user, { ...command.input, source: 'web' })
							);
						case 'decks.createRecord':
							return json(await application.decks.createDeckRecord(user, command.input));
						case 'decks.addCatalogCard':
							return json(await application.decks.addCatalogCardToDeck(user, command.input));
						case 'decks.changePrinting':
							return json(await application.decks.changeDeckPrinting(user, command.input));
						case 'decks.updateCard': {
							const input = command.input;
							return json(
								await application.decks.updateDeckCard(
									user,
									input.entryId,
									input.quantity,
									input.role,
									input.requestId,
									input.delta,
									'web',
									input.categoryPreview
								)
							);
						}
						case 'decks.removeCard':
							return json(
								await application.decks.removeDeckCard(
									user,
									command.input.entryId,
									command.input.requestId,
									'web'
								)
							);
						case 'decks.importInto':
							return json(await application.decks.importIntoDeck(user, command.input));
					}
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		}
	];
}
