import { localizeMessage } from '#lib/i18n/presentation.ts';
import { translate } from '#lib/i18n/messages.ts';
import { fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { application } from '#lib/server/composition.ts';
import { deckImportText, readDeckImportForm } from '#lib/server/mtg/deck-import.ts';
import { ValidationError } from '@spellbook/contracts/validation.ts';
import { RequestConflictError } from '#lib/server/remote/errors.ts';

export const load: PageServerLoad = async ({ locals, request, setHeaders }) => {
	if (!locals.user) throw redirect(303, '/auth/login?returnTo=/mtg/decks/import');
	// Native POST actions already set this header before SvelteKit reruns the load.
	if (request.method !== 'POST') setHeaders({ 'cache-control': 'no-store' });
	return { requestId: crypto.randomUUID() };
};

export const actions = {
	default: async ({ request, locals, setHeaders }) => {
		if (!locals.user) throw redirect(303, '/auth/login?returnTo=/mtg/decks/import');
		setHeaders({ 'cache-control': 'no-store' });
		let text = '';
		let requestId = '';
		let name = '';
		let format = 'Commander';
		let description = '';
		let committing = false;
		try {
			const form = await readDeckImportForm(request);
			requestId = String(form.get('requestId') ?? '');
			name = String(form.get('name') ?? '');
			format = String(form.get('format') ?? 'Commander');
			description = String(form.get('description') ?? '');
			text = typeof form.get('text') === 'string' ? String(form.get('text')) : '';
			text = await deckImportText(form);
			committing = form.get('intent') === 'commit';
			if (committing) {
				const receipt = await application.decks.importTextDeck(locals.user, {
					requestId,
					source: 'import',
					game: 'mtg',
					text,
					name,
					format,
					description
				});
				throw redirect(303, `/mtg/decks?deck=${encodeURIComponent(receipt.deckId)}`);
			}
			const preview = await application.decks.previewMtgImport(locals.user, text);
			return { preview, text, requestId: crypto.randomUUID(), name, format, description };
		} catch (cause) {
			if (cause instanceof ValidationError)
				return fail(cause instanceof RequestConflictError ? 409 : 400, {
					message: localizeMessage(locals.locale, cause.message),
					text,
					requestId,
					name,
					format,
					description
				});
			if (isRedirect(cause)) throw cause;
			if (cause && typeof cause === 'object' && 'kind' in cause && cause.kind === 'Unauthenticated')
				throw redirect(303, '/auth/login?returnTo=/mtg/decks/import');
			return fail(503, {
				message: translate(
					locals.locale,
					'notice.The.import.could.not.be.confirmed.Retry.with.the.same.content'
				),
				retryCommit: committing,
				text,
				requestId,
				name,
				format,
				description
			});
		}
	}
} satisfies Actions;
