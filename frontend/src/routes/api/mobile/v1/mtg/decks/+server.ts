import { badRequestIfValidation } from '$lib/server/mobile/route-errors';
import { readString, readJsonObject } from '$lib/server/http/request';
import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { createDeckEntry, getDeckSnapshotEntry } from '$lib/server/mobile/mtg-service';

export const GET = async (event) => {
	const auth = await requireMobileAuth(event);
	return json(await getDeckSnapshotEntry(auth));
};

export const POST = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await readJsonObject(event.request);
	if (!body?.name) {
		throw error(400, 'name is required');
	}

	try {
		return json(
			await createDeckEntry(auth, {
				name: readString(body.name, 'name'),
				description: readString(body.description, 'description', ''),
				format: readString(body.format, 'format', 'Commander')
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
