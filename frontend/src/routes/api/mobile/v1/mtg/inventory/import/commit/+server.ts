import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { bulkMutateInventory } from '$lib/server/mobile/mtg-service';
import { isCommittedDeckRole, previewMtgImport, toCardIdentity } from '$lib/server/mtg/import';
import { assertCondition, assertFinish, ValidationError } from '$lib/server/mtg/validation';
import { badRequestIfValidation } from '$lib/server/mobile/route-errors';

export const POST = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await event.request.json();
	try {
		const defaultFinish = assertFinish(body?.defaultFinish ?? 'nonfoil');
		const defaultCondition = assertCondition(body?.defaultCondition ?? 'NM');
		const preview = await previewMtgImport(String(body?.text ?? ''));
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
			requestId: String(body?.requestId ?? ''),
			source: String(body?.source ?? 'import'),
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
