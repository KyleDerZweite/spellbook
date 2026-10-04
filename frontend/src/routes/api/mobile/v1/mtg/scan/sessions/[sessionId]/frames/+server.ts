import type { RequestHandler } from './$types';
import { readRequestBytes, requireUuid } from '#lib/server/http/request.ts';
import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { processScanArtifact } from '#lib/server/mobile/scan-worker.ts';
import {
	recordScanArtifactEntry,
	getScanSessionResultEntry
} from '#lib/server/mobile/mtg-service.ts';
import { ScanAccessError } from '#lib/server/data/scan.ts';
import { ValidationError } from '#lib/server/mtg/validation.ts';
import {
	deleteScanObject,
	scanImageContentType,
	ScanImageError,
	uploadScanObject
} from '#lib/server/mobile/storage.ts';

export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const sessionId = requireUuid(event.params.sessionId, 'sessionId');

	const { session } = await getScanSessionResultEntry(auth, sessionId);
	if (!session) throw error(404, 'Scan session not found');
	if (session.status !== 'open') throw error(409, 'Scan session is not open for uploads');

	if (
		event.request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
		'multipart/form-data'
	) {
		error(415, 'Scan uploads require multipart/form-data');
	}
	const formBytes = await readRequestBytes(event.request, 12 * 1024 * 1024);
	let formData: FormData;
	try {
		formData = await new Request(event.request.url, {
			method: 'POST',
			headers: event.request.headers,
			body: formBytes
		}).formData();
	} catch {
		error(400, 'Malformed multipart upload');
	}
	const file = formData.get('file');
	if (!(file instanceof File)) {
		throw error(400, 'multipart file field "file" is required');
	}

	const extensions: Record<string, string> = {
		'image/jpeg': 'jpg',
		'image/png': 'png',
		'image/webp': 'webp'
	};
	const extension = extensions[file.type];
	if (!extension) throw error(415, 'Scan uploads require JPEG, PNG, or WebP');
	if (!file.size) throw error(400, 'Scan upload must not be empty');
	if (file.size > 10 * 1024 * 1024) throw error(413, 'Scan image exceeds 10 MiB');
	if (!file.name.trim() || file.name.length > 255) throw error(400, 'Invalid scan file name');

	const artifactId = crypto.randomUUID();
	const bytes = new Uint8Array(await file.arrayBuffer());
	try {
		if (scanImageContentType(bytes) !== file.type)
			error(415, 'Scan image content does not match its MIME type');
	} catch (cause) {
		if (cause instanceof ScanImageError) error(cause.status, cause.message);
		throw cause;
	}
	const objectKey = `scan-sessions/${sessionId}/${artifactId}.${extension}`;
	try {
		await uploadScanObject(objectKey, bytes, file.type);

		const workerResult = await processScanArtifact({
			sessionId,
			artifactId,
			originalObjectKey: objectKey,
			contentType: file.type,
			fileName: file.name
		});

		const artifact = await recordScanArtifactEntry(auth, {
			artifactId,
			sessionId,
			originalObjectKey: objectKey,
			normalizedObjectKey: workerResult.normalizedObjectKey,
			qualityScore: workerResult.qualityScore,
			embeddingModelVersion: workerResult.embeddingModelVersion,
			ocrModelVersion: workerResult.ocrModelVersion,
			status: workerResult.status,
			ocrName: workerResult.ocrTokens.name,
			ocrSetCode: workerResult.ocrTokens.setCode,
			ocrCollectorNumber: workerResult.ocrTokens.collectorNumber,
			candidateJson: JSON.stringify(workerResult.candidates)
		});

		return json({
			artifact,
			result: workerResult
		});
	} catch (cause) {
		try {
			await deleteScanObject(objectKey);
		} catch {
			console.error('Failed to clean up a rejected scan upload');
		}
		if (cause instanceof ScanAccessError) error(cause.status, cause.message);
		if (cause instanceof ValidationError) error(400, cause.message);
		error(502, 'Scan processing failed. Retry the upload.');
	}
};
