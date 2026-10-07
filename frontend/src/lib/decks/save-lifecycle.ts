import type { Deck } from '@spellbook/contracts/decks.ts';
export type DeckEditor = 'create' | 'details' | 'import' | 'delete' | 'inspector';
type Opening = { targetId: string };
type Scope = { accountId: string; deckId: string | null; flow: string };
export type DeckSubmission = {
	scope: Scope;
	action: string;
	editor?: DeckEditor;
	opening?: Opening;
};
export type SavedDetails = Pick<
	Deck,
	'id' | 'name' | 'format' | 'description' | 'descriptionRevision'
>;

/** Owns completion authority, not requests, persistence or editor drafts. */
export class DeckSaveLifecycle {
	private scope: Scope;
	private live = true;
	private openings = new Map<DeckEditor, Opening>();
	constructor(accountId: string, deckId: string | null, flow = '') {
		this.scope = { accountId, deckId, flow };
	}
	setScope(accountId: string, deckId: string | null, flow: string): boolean {
		if (
			this.scope.accountId === accountId &&
			this.scope.deckId === deckId &&
			this.scope.flow === flow
		)
			return false;
		this.scope = { accountId, deckId, flow };
		this.openings.clear();
		return true;
	}
	open(editor: DeckEditor, targetId = this.scope.deckId ?? ''): void {
		this.openings.set(editor, { targetId });
	}
	close(editor: DeckEditor): void {
		this.openings.delete(editor);
	}
	destroy(): void {
		this.live = false;
		this.openings.clear();
	}
	capture(action: string, targetId = '', inspector = false): DeckSubmission {
		const editor: DeckEditor | undefined =
			action === 'createDeck'
				? 'create'
				: action === 'updateDeck'
					? 'details'
					: action === 'deleteDeck'
						? 'delete'
						: action === 'commitImport'
							? 'import'
							: action === 'changePrinting' ||
								  action === 'removeCard' ||
								  (action === 'addCard' && inspector)
								? 'inspector'
								: undefined;
		const opening = editor ? this.openings.get(editor) : undefined;
		return {
			scope: this.scope,
			action,
			editor,
			opening: editor === 'inspector' && opening?.targetId !== targetId ? undefined : opening
		};
	}
	isCurrent(submission: DeckSubmission): boolean {
		return this.live && submission.scope === this.scope;
	}
	canClose(submission: DeckSubmission, editor: DeckEditor): boolean {
		return (
			this.isCurrent(submission) &&
			submission.editor === editor &&
			!!submission.opening &&
			this.openings.get(editor) === submission.opening
		);
	}
	async refresh(submission: DeckSubmission, update: () => Promise<void>): Promise<boolean> {
		if (!this.isCurrent(submission)) return false;
		await update();
		return this.isCurrent(submission);
	}
	savedDetails(submission: DeckSubmission, value: unknown): SavedDetails | undefined {
		if (
			!this.canClose(submission, 'details') ||
			!value ||
			typeof value !== 'object' ||
			!('id' in value) ||
			typeof value.id !== 'string' ||
			value.id !== submission.scope.deckId ||
			!('name' in value) ||
			typeof value.name !== 'string' ||
			!('format' in value) ||
			typeof value.format !== 'string' ||
			!('description' in value) ||
			typeof value.description !== 'string' ||
			!('descriptionRevision' in value) ||
			typeof value.descriptionRevision !== 'string'
		)
			return undefined;
		return {
			id: value.id,
			name: value.name,
			format: value.format,
			description: value.description,
			descriptionRevision: value.descriptionRevision
		};
	}
}
