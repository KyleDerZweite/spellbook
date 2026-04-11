import { privateEnv } from '$lib/env/private';
import type { ScanWorkerResult } from './types';

export async function processScanArtifact(input: {
	sessionId: string;
	artifactId: string;
	originalObjectKey: string;
	contentType: string;
	fileName: string;
}): Promise<ScanWorkerResult> {
	const baseUrl = privateEnv.SCAN_WORKER_URL ?? 'http://scan-worker:8080';
	const response = await fetch(`${baseUrl}/v1/scan/process`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(input)
	});

	if (!response.ok) {
		throw new Error(`Scan worker request failed: ${response.status} ${response.statusText}`);
	}

	return (await response.json()) as ScanWorkerResult;
}
