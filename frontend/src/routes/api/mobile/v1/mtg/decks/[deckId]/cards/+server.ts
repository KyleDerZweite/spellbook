import { normalizeQuantity } from '$lib/server/mtg/validation';
import { badRequestIfValidation } from '$lib/server/mobile/route-errors';
import { readString, readJsonObject, requireUuid, readNumber } from '$lib/server/http/request';
import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { addDeckCardEntry } from '$lib/server/mobile/mtg-service';

export const POST = async (event) => {
	const auth = await requireMobileAuth(event);
	const deckId = requireUuid(event.params.deckId, 'deckId');
	const body = await readJsonObject(event.request);
	if (!deckId || !body?.catalogCardId || !body?.canonicalCardId || !body?.name) {
		throw error(400, 'deckId, catalogCardId, canonicalCardId, and name are required');
	}

	try {
		return json(
			await addDeckCardEntry(auth, {
				deckId,
				catalogCardId: readString(body.catalogCardId, 'catalogCardId'),
				canonicalCardId: readString(body.canonicalCardId, 'canonicalCardId'),
				name: readString(body.name, 'name'),
				setCode: readString(body.setCode, 'setCode', ''),
				imageUri: readString(body.imageUri, 'imageUri', ''),
				quantity: normalizeQuantity(readNumber(body.quantity, 'quantity', 1)),
				role: readString(body.role, 'role', 'main')
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
