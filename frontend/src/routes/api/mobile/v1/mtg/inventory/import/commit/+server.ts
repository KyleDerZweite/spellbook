import type { RequestHandler } from './$types';
import { readString, readJsonObject } from '#lib/server/http/request.ts';
import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { bulkMutateInventory } from '#lib/server/mobile/mtg-service.ts';
import { isCommittedDeckRole, previewMtgImport, toCardIdentity } from '#lib/server/mtg/import.ts';
import { assertCondition, assertFinish, ValidationError } from '#lib/server/mtg/validation.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';

export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await readJsonObject(event.request);
	try {
		const defaultFinish = assertFinish(body?.defaultFinish ?? 'nonfoil');
		const defaultCondition = assertCondition(body?.defaultCondition ?? 'NM');
		const preview = await previewMtgImport(readString(body.text, 'text', ''));
		const operations = preview.resolved
			.filter(({ line }) => isCommittedDeckRole(line.role) && line.role === 'main')
			.map(({ line, card }) => ({
				op: 'add' as const,
				card: toCardIdentity(card),
				finish: defaultFinish,
				condition: defaultCondition,
				quantity: line.quantity,
				notes: ''
			}));

		if (operations.length === 0) {
			throw new ValidationError('No resolved inventory lines to commit');
		}

		const snapshot = await bulkMutateInventory(auth, {
			requestId: readString(body.requestId, 'requestId', ''),
			source: readString(body.source, 'source', 'import'),
			operations
		});

		return json({
			snapshot,
			import: {
				resolvedCount: operations.length,
				unresolved: preview.unresolved,
				ambiguous: preview.ambiguous,
				warnings: preview.warnings
			}
		});
	} catch (cause) {
		badRequestIfValidation(cause, 'Invalid inventory import commit');
	}
};
