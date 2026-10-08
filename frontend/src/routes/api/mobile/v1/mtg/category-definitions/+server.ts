import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { readJsonObject, readQueryInteger } from '#lib/server/http/request.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
import type { CategoryScope, SaveDefinitionInput } from '@spellbook/contracts/category-library.ts';
export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	try {
		return json(
			await application.categories.getLibrary(auth.user, {
				scope: (event.url.searchParams.get('scope') ?? undefined) as CategoryScope | undefined,
				offset: readQueryInteger(
					event.url.searchParams.get('offset'),
					'offset',
					0,
					Number.MAX_SAFE_INTEGER,
					0
				),
				limit: readQueryInteger(event.url.searchParams.get('limit'), 'limit', 50, 100, 1)
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event),
		body = await readJsonObject(event.request, 65536);
	try {
		return json(
			await application.categories.saveDefinition(auth.user, body as SaveDefinitionInput)
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
