import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { addDeckCardEntry } from '$lib/server/mobile/spacetimedb';

export const POST = async (event) => {
	const auth = await requireMobileAuth(event);
	const deckId = event.params.deckId?.trim();
	const body = await event.request.json();
	if (!deckId || !body?.catalogCardId || !body?.canonicalCardId || !body?.name) {
		throw error(400, 'deckId, catalogCardId, canonicalCardId, and name are required');
	}

	return json(
		await addDeckCardEntry(auth, {
			deckId,
			catalogCardId: String(body.catalogCardId),
			canonicalCardId: String(body.canonicalCardId),
			name: String(body.name),
			setCode: String(body.setCode ?? ''),
			imageUri: String(body.imageUri ?? ''),
			quantity: Number(body.quantity ?? 1),
			role: String(body.role ?? 'main')
		})
	);
};
