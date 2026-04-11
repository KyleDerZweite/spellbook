import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { processScanArtifact } from '$lib/server/mobile/scan-worker';
import {
	recordScanArtifactEntry,
	updateScanSessionStatusEntry
} from '$lib/server/mobile/spacetimedb';
import { uploadScanObject } from '$lib/server/mobile/storage';

export const POST = async (event) => {
	const auth = await requireMobileAuth(event);
	const sessionId = event.params.sessionId?.trim();
	if (!sessionId) {
		throw error(400, 'sessionId is required');
	}

	const formData = await event.request.formData();
	const file = formData.get('file');
	if (!(file instanceof File)) {
		throw error(400, 'multipart file field "file" is required');
	}

	const artifactId = crypto.randomUUID();
	const bytes = new Uint8Array(await file.arrayBuffer());
	const extension = file.type === 'image/png' ? 'png' : 'jpg';
	const objectKey = `scan-sessions/${sessionId}/${artifactId}.${extension}`;
	await uploadScanObject(objectKey, bytes, file.type || 'application/octet-stream');

	const workerResult = await processScanArtifact({
		sessionId,
		artifactId,
		originalObjectKey: objectKey,
		contentType: file.type || 'application/octet-stream',
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
	await updateScanSessionStatusEntry(auth, sessionId, 'pending_review');

	return json({
		artifact,
		result: workerResult
	});
};
