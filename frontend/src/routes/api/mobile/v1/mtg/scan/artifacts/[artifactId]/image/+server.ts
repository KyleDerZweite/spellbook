import type { RequestHandler } from './$types';
import { requireUuid } from '#lib/server/http/request.ts';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { scanHttpError } from '#lib/server/mobile/scan.ts';
export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	try {
		const { bytes, contentType } = await application.scan.readImage(
			auth.user,
			requireUuid(event.params.artifactId, 'artifactId'),
			event.request.signal
		);
		return new Response(new Uint8Array(bytes), {
			headers: {
				'Content-Type': contentType,
				'Content-Length': String(bytes.byteLength),
				'Cache-Control': 'no-store',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (cause) {
		scanHttpError(cause);
	}
};
