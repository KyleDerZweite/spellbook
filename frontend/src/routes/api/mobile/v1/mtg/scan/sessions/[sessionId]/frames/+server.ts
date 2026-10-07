import type { RequestHandler } from './$types';
import { readRequestBytes, requireUuid } from '#lib/server/http/request.ts';
import { error, json } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { scanHttpError } from '#lib/server/mobile/scan.ts';
export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event),
		sessionId = requireUuid(event.params.sessionId, 'sessionId');
	try {
		await application.scan.assertUploadable(auth.user, sessionId);
		if (
			event.request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
			'multipart/form-data'
		)
			error(415, 'Scan uploads require multipart/form-data');
		const bytes = await readRequestBytes(event.request, 12 * 1024 * 1024);
		let form: FormData;
		try {
			form = await new Request(event.request.url, {
				method: 'POST',
				headers: event.request.headers,
				body: bytes
			}).formData();
		} catch {
			error(400, 'Malformed multipart upload');
		}
		const file = form.get('file');
		if (!(file instanceof File)) error(400, 'multipart file field "file" is required');
		return json(
			await application.scan.uploadFrame(
				auth.user,
				{
					sessionId,
					bytes: new Uint8Array(await file.arrayBuffer()),
					contentType: file.type,
					fileName: file.name
				},
				event.request.signal
			),
			{ headers: { 'Cache-Control': 'no-store' } }
		);
	} catch (cause) {
		scanHttpError(cause);
	}
};
