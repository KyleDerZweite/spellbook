import { untrack } from 'svelte';
import type { ActionResult } from '$app/forms';
import type {
	CategoryRuleChoices,
	CategoryScope,
	LibraryAcknowledgement,
	SaveDefinitionInput
} from '@spellbook/contracts/category-library.ts';

export type CategoryEditorSeed = {
	accountId: string | null;
	scope: CategoryScope;
	routeOriginId: string | null;
	libraryRevision: string;
	draft: SaveDefinitionInput;
	choices: CategoryRuleChoices;
};
export type CategoryEditorReply = {
	draft?: SaveDefinitionInput;
	choices?: CategoryRuleChoices;
	message?: string;
	acknowledgement?: LibraryAcknowledgement;
};
export type CategoryEditorAuthority = { current(): boolean };
type OriginalRetry = {
	readonly action: string;
	readonly fields: readonly (readonly [string, string])[];
};
type RequestIdentity = { payload: string; requestId: string };

function draftIdentity(fields: FormData) {
	return JSON.stringify(
		[...fields.entries()].filter(([name]) => name !== 'requestId' && name !== 'ruleAction')
	);
}
function seedKey(seed: CategoryEditorSeed) {
	return JSON.stringify([seed.accountId, seed.scope, seed.routeOriginId]);
}
function copyDraft(draft: SaveDefinitionInput): SaveDefinitionInput {
	return structuredClone($state.snapshot(draft));
}
function copyChoices(choices: CategoryRuleChoices): CategoryRuleChoices {
	return structuredClone($state.snapshot(choices));
}

/** One mounted editor. List pagination and SavedState leases belong to the page. */
export function createCategoryLibraryEditor(input: {
	seed(): CategoryEditorSeed;
	activeAccount(): string | null;
	initialAction?: CategoryEditorReply | null;
}) {
	const initial = untrack(input.seed);
	let draft = $state(copyDraft(input.initialAction?.draft ?? initial.draft));
	let choices = $state(copyChoices(input.initialAction?.choices ?? initial.choices));
	let message = $state(input.initialAction?.message ?? '');
	let busy = $state(false);
	let dirty = $state(false);
	let confirmation = $state<LibraryAcknowledgement | null>(null);
	let originalRetry = $state.raw<OriginalRetry | null>(null);
	let retryRequest: RequestIdentity | null = null;
	let lastRequest: RequestIdentity | null = null;
	let key = seedKey(initial);
	let opening = {};
	let edits = 0;
	let live = true;
	let cleared = false;
	let reopened = false;
	let pending: object | null = null;
	let observedDraft = initial.draft;

	function resetOpening() {
		opening = {};
		reopened = false;
		edits = 0;
		pending = null;
		lastRequest = null;
		busy = dirty = false;
		confirmation = originalRetry = null;
		retryRequest = null;
		message = '';
	}
	function adopt(seed: CategoryEditorSeed) {
		draft = copyDraft(seed.draft);
		choices = copyChoices(seed.choices);
		reopened = false;
	}
	function confirmed(payload: string) {
		if (lastRequest?.payload === payload) lastRequest = null;
		if (retryRequest?.payload === payload) {
			originalRetry = null;
			retryRequest = null;
		}
	}
	function retainRetry(original: OriginalRetry, identity: RequestIdentity) {
		// Keep the earlier uncertain command available while newer controls are submitted.
		if (retryRequest && retryRequest.payload !== identity.payload) return;
		originalRetry = original;
		retryRequest = identity;
		if (lastRequest?.payload === identity.payload) lastRequest = null;
	}
	function synchronize(seed = input.seed()) {
		if (!live) return;
		const next = seedKey(seed);
		if (next === key) return;
		key = next;
		resetOpening();
		if (!cleared || (seed.accountId && input.activeAccount() === seed.accountId)) {
			cleared = false;
			adopt(seed);
		}
	}
	function clear() {
		resetOpening();
		cleared = true;
		choices = { tags: [], cards: [] };
		draft = {
			requestId: '',
			originId: null,
			expectedLibraryRevision: '0',
			scope: input.seed().scope,
			name: '',
			meaning: '',
			priority: 0,
			displayOrder: 0,
			roles: ['main'],
			rule: { op: 'all', children: [] },
			confirmRetainedRule: false
		};
	}
	function authority(): CategoryEditorAuthority {
		synchronize();
		const captured = opening;
		return {
			current() {
				synchronize();
				if (!live || cleared || captured !== opening) return false;
				const accountId = input.seed().accountId;
				if (!accountId || input.activeAccount() !== accountId) {
					clear();
					return false;
				}
				return true;
			}
		};
	}

	// Only external inputs schedule adoption. Owned controls and feedback never do.
	$effect(() => {
		const incoming = input.seed();
		const activeAccount = input.activeAccount();
		untrack(() => {
			if (!live) return;
			synchronize(incoming);
			if (cleared) {
				if (!incoming.accountId || activeAccount !== incoming.accountId) return;
				cleared = false;
				adopt(incoming);
			} else if (
				incoming.draft !== observedDraft &&
				!dirty &&
				!busy &&
				(reopened || draft.originId === incoming.routeOriginId) &&
				BigInt(incoming.libraryRevision) >= BigInt(draft.expectedLibraryRevision)
			) {
				adopt(incoming);
			}
			observedDraft = incoming.draft;
		});
	});

	return {
		get draft() {
			return draft;
		},
		get choices() {
			return choices;
		},
		get busy() {
			return busy;
		},
		get dirty() {
			return dirty;
		},
		get message() {
			return message;
		},
		get confirmation() {
			return confirmation;
		},
		get originalRetry() {
			return originalRetry;
		},
		edit() {
			synchronize();
			edits++;
			dirty = true;
		},
		reopen() {
			synchronize();
			resetOpening();
			reopened = true;
		},
		clear,
		dispose() {
			clear();
			live = false;
		},
		authority,
		beginSubmission(action: string, fields: FormData, editorFields: FormData) {
			const current = authority();
			if (!current.current() || busy) return null;
			const payload = action + JSON.stringify([...fields].filter(([name]) => name !== 'requestId'));
			const requestId =
				(retryRequest?.payload === payload ? retryRequest.requestId : undefined) ??
				(lastRequest?.payload === payload ? lastRequest.requestId : undefined) ??
				crypto.randomUUID();
			const identity = { payload, requestId };
			if (retryRequest?.payload !== payload) lastRequest = identity;
			fields.set('requestId', requestId);
			const original: OriginalRetry = Object.freeze({
				action,
				fields: Object.freeze(
					[...fields].map(([name, value]) => Object.freeze([name, String(value)] as const))
				)
			});
			const save = action.includes('/save');
			const submittedDraft = draftIdentity(save ? fields : editorFields);
			const submittedEdits = edits;
			const attempt = {};
			pending = attempt;
			busy = true;
			let completed = false;
			let finished = false;
			return {
				complete(
					result: ActionResult<CategoryEditorReply, CategoryEditorReply>,
					currentFields: FormData
				) {
					if (completed || finished || !current.current()) return;
					completed = true;
					const unchanged =
						submittedEdits === edits && submittedDraft === draftIdentity(currentFields);
					if (result.type === 'error') {
						retainRetry(original, identity);
						message =
							retryRequest?.payload === payload
								? 'Could not confirm this submission. Your draft is retained. Retry the same submission.'
								: 'Could not confirm this submission. Your draft and the earlier original retry are retained. Submit the current draft again to retry it.';
						return;
					}
					if (result.type === 'redirect') return unchanged ? { redirect: true } : undefined;
					const reply = result.data;
					if (reply?.acknowledgement) {
						const acknowledged = reply.acknowledgement;
						confirmation = acknowledged;
						confirmed(payload);
						message = unchanged
							? (reply.message ?? 'Submitted definition saved.')
							: 'Submitted definition saved. Your newer edits remain unsaved.';
						if (unchanged && reply.draft) draft = copyDraft(reply.draft);
						if (save) {
							draft.originId = acknowledged.originId;
							draft.expectedLibraryRevision = acknowledged.libraryRevision;
							dirty = !unchanged;
						}
						return { refresh: current };
					}
					if (result.type === 'failure' && result.status >= 500) {
						retainRetry(original, identity);
					}
					message =
						!unchanged && reply?.draft
							? result.type === 'success'
								? 'This criteria response belongs to an earlier draft. Your newer edits are retained. Update criteria again.'
								: `${reply.message ?? 'The earlier submission failed.'} Your newer edits are retained.`
							: (reply?.message ?? '');
					if (unchanged) {
						if (reply?.draft) {
							draft = copyDraft(reply.draft);
							dirty = true;
						}
						if (reply?.choices) choices = copyChoices(reply.choices);
					}
					if (result.type === 'success') confirmed(payload);
				},
				finish() {
					finished = true;
					if (pending === attempt && current.current()) {
						pending = null;
						busy = false;
					}
				}
			};
		}
	};
}
