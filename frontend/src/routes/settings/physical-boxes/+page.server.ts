import { fail, redirect } from '@sveltejs/kit';
import { parseSortPredicates, type SortField } from '@spellbook/contracts/cardstation-sort-rule.ts';
import { isPhysicalBoxId, type PhysicalBox } from '@spellbook/contracts/physical-boxes.ts';
import { ValidationError } from '@spellbook/contracts/validation.ts';
import { requireSameOrigin } from '#lib/server/auth/local.ts';
import { RemoteError, RequestConflictError } from '#lib/server/remote/errors.ts';
import type { Actions, PageServerLoad } from './$types';

const isValidation = (status: number) => status === 400 || status === 422;
const apiPath = '/api/v1/mtg/physical-boxes';
const pagePath = '/settings/physical-boxes';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	setHeaders({ 'Cache-Control': 'private, no-store' });
	if (!locals.user) redirect(303, '/auth/login?returnTo=/settings/physical-boxes');
	return {
		boxes: await locals.api.request<PhysicalBox[]>(apiPath),
		requestId: crypto.randomUUID()
	};
};

function saveFailure(cause: unknown) {
	if (cause instanceof RequestConflictError) return 409;
	if (cause instanceof ValidationError) return 400;
	if (cause instanceof RemoteError) return cause.status;
	throw cause;
}

export const actions: Actions = {
	create: async (event) => {
		requireSameOrigin(event);
		const form = await event.request.formData();
		const name = String(form.get('name') ?? '');
		const requestId = String(form.get('requestId') ?? '');
		try {
			await event.locals.api.request(apiPath, { method: 'POST', body: { name, requestId } });
		} catch (cause) {
			const status = saveFailure(cause);
			return fail(status, {
				intent: 'create' as const,
				name,
				requestId: status === 409 ? crypto.randomUUID() : requestId,
				validation: isValidation(status),
				conflict: status === 409
			});
		}
		redirect(303, pagePath);
	},
	rename: async (event) => {
		requireSameOrigin(event);
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const name = String(form.get('name') ?? '');
		try {
			if (!isPhysicalBoxId(id)) throw new ValidationError('Invalid Physical Box ID');
			await event.locals.api.request(`${apiPath}/${id}`, {
				method: 'PATCH',
				body: { name }
			});
		} catch (cause) {
			const status = saveFailure(cause);
			return fail(status, {
				intent: 'rename' as const,
				id,
				name,
				validation: isValidation(status)
			});
		}
		redirect(303, pagePath);
	},
	condition: async (event) => {
		requireSameOrigin(event);
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const printedColor = form.getAll('printedColor').map(String);
		const rarity = form.getAll('rarity').map(String);
		const setCodes = String(form.get('setCode') ?? '');
		const fields: [SortField, string[]][] = [
			['printedColor', printedColor],
			['rarity', rarity],
			[
				'setCode',
				setCodes
					.split(',')
					.map((code) => code.trim())
					.filter(Boolean)
			]
		];
		try {
			const predicates = fields
				.filter(([, values]) => values.length)
				.map(([field, oneOf]) => ({
					field,
					oneOf
				}));
			const condition =
				form.get('clear') || !predicates.length ? null : parseSortPredicates(predicates);
			if (!isPhysicalBoxId(id)) throw new ValidationError('Invalid Physical Box ID');
			await event.locals.api.request(`${apiPath}/${id}`, {
				method: 'PATCH',
				body: { condition }
			});
		} catch (cause) {
			const status = saveFailure(cause);
			return fail(status, {
				validation: isValidation(status),
				intent: 'condition' as const,
				id,
				printedColor,
				rarity,
				setCodes
			});
		}
		redirect(303, pagePath);
	}
};
