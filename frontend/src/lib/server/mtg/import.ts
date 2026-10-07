import { application } from '#lib/server/composition.ts';
import { previewMtgImport as preview } from '@spellbook/backend/decks/import.ts';
export const previewMtgImport = (text: string, format = '') =>
	preview(application.catalog, text, format);
export { toCardIdentity, isCommittedDeckRole } from '@spellbook/backend/decks/import.ts';
