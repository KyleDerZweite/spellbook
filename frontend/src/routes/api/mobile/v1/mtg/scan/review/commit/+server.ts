import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import {
	batchAddInventory,
	updateScanSessionStatusEntry,
	upsertScanReviewItemEntry
} from '$lib/server/mobile/postgres';

export const POST = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await event.request.json();
	if (!body?.requestId || !body?.sessionId || !Array.isArray(body?.items)) {
		throw error(400, 'requestId, sessionId, and items are required');
	}

	for (const item of body.items) {
		await upsertScanReviewItemEntry(auth, {
			id: String(item.id ?? crypto.randomUUID()),
			sessionId: String(body.sessionId),
			scanArtifactId: String(item.scanArtifactId),
			catalogCardId: String(item.selectedCandidate.catalogCardId),
			canonicalCardId: String(item.selectedCandidate.canonicalCardId),
			oracleId: String(item.selectedCandidate.oracleId),
			name: String(item.selectedCandidate.name),
			setCode: String(item.selectedCandidate.setCode),
			collectorNumber: String(item.selectedCandidate.collectorNumber ?? ''),
			imageUri: String(item.selectedCandidate.imageUri ?? ''),
			similarityScore: Number(item.selectedCandidate.similarityScore ?? 0),
			ocrScore: Number(item.selectedCandidate.ocrScore ?? 0),
			finalScore: Number(item.selectedCandidate.finalScore ?? 0),
			matchReason: String(item.selectedCandidate.matchReason ?? 'manual_review'),
			finish: String(item.finish ?? 'nonfoil'),
			condition: String(item.condition ?? 'NM'),
			quantity: Number(item.quantity ?? 1)
		});
	}

	const committed = await batchAddInventory(auth, {
		requestId: String(body.requestId),
		source: 'scan_review',
		items: body.items.map((item: any) => ({
			catalogCardId: String(item.selectedCandidate.catalogCardId),
			canonicalCardId: String(item.selectedCandidate.canonicalCardId),
			name: String(item.selectedCandidate.name),
			setCode: String(item.selectedCandidate.setCode),
			imageUri: String(item.selectedCandidate.imageUri ?? ''),
			finish: String(item.finish ?? 'nonfoil'),
			condition: String(item.condition ?? 'NM'),
			quantity: Number(item.quantity ?? 1)
		}))
	});
	await updateScanSessionStatusEntry(auth, String(body.sessionId), 'committed');

	return json(committed);
};
