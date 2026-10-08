import { randomUUID } from 'node:crypto';
import { fail, redirect, isRedirect, isHttpError } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { ValidationError } from '#lib/server/mtg/validation.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
import { application } from '#lib/server/composition.ts';
import { readCategoryForm } from '#lib/server/categories/forms.ts';
import { defaultRule, readRuleForm, ruleSelections } from '#lib/categories/rule-form.ts';
import { readQueryInteger } from '#lib/server/http/request.ts';
import type { CategoryScope, SaveDefinitionInput } from '@spellbook/contracts/category-library.ts';

export const load: PageServerLoad = async ({ locals, url }) => {
	try {
		if (!locals.user) throw redirect(303, '/auth/login?returnTo=/mtg/categories');
		const scope: CategoryScope = url.searchParams.get('scope') === 'deck' ? 'deck' : 'entry';
		const library = await application.categories.getLibrary(locals.user, {
			scope,
			offset: readQueryInteger(url.searchParams.get('offset'), 'offset', 0),
			limit: 50
		});
		const edit = url.searchParams.get('edit'),
			definition = edit ? await application.categories.getDefinition(locals.user, edit) : null;
		const draft: SaveDefinitionInput = definition
			? {
					...definition.current,
					requestId: randomUUID(),
					originId: definition.originId,
					expectedLibraryRevision: definition.libraryRevision,
					confirmRetainedRule: false
				}
			: {
					requestId: randomUUID(),
					originId: null,
					expectedLibraryRevision: library.revision,
					scope,
					name: '',
					meaning: '',
					priority: 0,
					displayOrder: 0,
					roles: ['main'],
					rule: defaultRule(scope),
					confirmRetainedRule: false
				};
		const choices = await application.categories.getRuleChoices(
			locals.user,
			ruleSelections(draft.rule)
		);
		return {
			library,
			draft,
			choices,
			scope,
			editing: !!definition,
			archived: definition?.archived ?? false
		};
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
export const actions = {
	save: async ({ locals, request }) => {
		if (!locals.user) throw redirect(303, '/auth/login?returnTo=/mtg/categories');
		const form = await readCategoryForm(request);
		const scope: CategoryScope = form.get('scope') === 'deck' ? 'deck' : 'entry';
		let draft: SaveDefinitionInput = {
			requestId: String(form.get('requestId') ?? ''),
			originId: String(form.get('originId') ?? '') || null,
			expectedLibraryRevision: String(
				form.get('rebaseLibraryRevision') ?? form.get('expectedLibraryRevision') ?? ''
			),
			scope,
			name: String(form.get('name') ?? ''),
			meaning: String(form.get('meaning') ?? ''),
			priority: Number(form.get('priority')),
			displayOrder: Number(form.get('displayOrder')),
			roles: form.getAll('roles').map(String) as SaveDefinitionInput['roles'],
			rule: defaultRule(scope),
			confirmRetainedRule: form.get('confirmRetainedRule') === 'on'
		};
		try {
			try {
				draft = { ...draft, rule: readRuleForm(form, scope) };
			} catch (cause) {
				const recovery = new FormData();
				for (const [key, value] of form) recovery.append(key, value);
				recovery.set('ruleAction', 'update');
				try {
					draft.rule = readRuleForm(recovery, scope);
				} catch {
					/* Retain safe default for malformed structural input. */
				}
				return fail(400, {
					draft,
					message: cause instanceof Error ? cause.message : 'Invalid criteria draft'
				});
			}
			const choices = await application.categories.getRuleChoices(locals.user, {
				...ruleSelections(draft.rule),
				tagQuery: String(form.get('tagQuery') ?? ''),
				cardQuery: String(form.get('cardQuery') ?? '')
			});
			if (form.get('ruleAction'))
				return { draft, choices, message: 'Criteria updated. Review them before saving.' };
			const acknowledgement = await application.categories.saveDefinition(locals.user, draft);
			if (request.headers.get('x-sveltekit-action') === 'true')
				return { acknowledgement, draft, message: 'Submitted definition saved.' };
			throw redirect(303, `/mtg/categories?scope=${scope}`);
		} catch (cause) {
			if (isRedirect(cause) || isHttpError(cause)) throw cause;
			const kind = cause && typeof cause === 'object' && 'kind' in cause ? String(cause.kind) : '';
			if (kind === 'Unauthenticated') throw redirect(303, '/auth/login?returnTo=/mtg/categories');
			const status =
				kind === 'RequestConflict'
					? 409
					: kind === 'NotFound'
						? 404
						: kind === 'ValidationFailed'
							? 400
							: 503;
			return fail(status, {
				draft,
				message:
					cause instanceof Error &&
					(kind === 'RequestConflict' ||
						kind === 'NotFound' ||
						kind === 'CategoryUnavailable' ||
						cause instanceof ValidationError)
						? cause.message
						: 'The definition could not be saved. Your draft is retained. Retry the same request.'
			});
		}
	},
	archive: async ({ locals, request }) => {
		if (!locals.user) throw redirect(303, '/auth/login?returnTo=/mtg/categories');
		const form = await readCategoryForm(request);
		try {
			const acknowledgement = await application.categories.archiveDefinition(locals.user, {
				requestId: String(form.get('requestId') ?? ''),
				originId: String(form.get('originId') ?? ''),
				expectedLibraryRevision: String(
					form.get('rebaseLibraryRevision') ?? form.get('expectedLibraryRevision') ?? ''
				),
				archived: form.get('archived') === 'true'
			});
			if (request.headers.get('x-sveltekit-action') === 'true')
				return { acknowledgement, message: 'Future adoption state saved.' };
			throw redirect(
				303,
				`/mtg/categories?scope=${form.get('scope') === 'deck' ? 'deck' : 'entry'}`
			);
		} catch (cause) {
			if (isRedirect(cause) || isHttpError(cause)) throw cause;
			const kind = cause && typeof cause === 'object' && 'kind' in cause ? String(cause.kind) : '';
			if (kind === 'Unauthenticated') throw redirect(303, '/auth/login?returnTo=/mtg/categories');
			return fail(
				kind === 'RequestConflict'
					? 409
					: kind === 'NotFound'
						? 404
						: cause instanceof ValidationError
							? 400
							: 503,
				{
					message:
						cause instanceof Error && kind
							? cause.message
							: 'The archive change could not be saved. Retry the same request.'
				}
			);
		}
	}
} satisfies Actions;
