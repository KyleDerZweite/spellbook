import { requireUuid } from '$lib/server/http/request';
import { error } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { getOwnedScanArtifact, ScanAccessError } from '$lib/server/data/scan';
import { readScanImage, ScanImageError } from '$lib/server/mobile/storage';

export const GET = async (event) => {
	const auth = await requireMobileAuth(event);
	const artifactId = requireUuid(event.params.artifactId, 'artifactId');
	try {
		const { artifact } = await getOwnedScanArtifact(auth.user.accountId, artifactId);
		const { bytes, contentType } = await readScanImage(artifact.originalObjectKey);
		return new Response(new Uint8Array(bytes), {
			headers: {
				'Content-Type': contentType,
				'Content-Length': String(bytes.byteLength),
				'Cache-Control': 'no-store',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (cause) {
		if (cause instanceof ScanAccessError || cause instanceof ScanImageError)
			error(cause.status, cause.message);
		throw cause;
	}
};
