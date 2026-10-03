import type { RequestHandler } from './$types';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
import { readString, readJsonObject } from '#lib/server/http/request.ts';
import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { createDeckEntry, getDeckSnapshotEntry } from '#lib/server/mobile/mtg-service.ts';

export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	return json(await getDeckSnapshotEntry(auth));
};

export const POST: RequestHandler = async (event) => {
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
