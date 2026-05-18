import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import {
	batchAddInventory,
	updateScanSessionStatusEntry,
	upsertScanReviewItemEntry
} from '$lib/server/mobile/mtg-service';

interface ScanReviewCandidateInput {
	catalogCardId: string;
	canonicalCardId: string;
	oracleId: string;
	name: string;
	setCode: string;
	collectorNumber?: string;
	imageUri?: string;
	similarityScore?: number;
	ocrScore?: number;
	finalScore?: number;
	matchReason?: string;
}

interface ScanReviewItemInput {
	id?: string;
	scanArtifactId: string;
	selectedCandidate: ScanReviewCandidateInput;
	finish?: string;
	condition?: string;
	quantity?: number;
}

interface ScanReviewCommitBody {
	requestId: string;
	sessionId: string;
	items: ScanReviewItemInput[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function parseBody(value: unknown): ScanReviewCommitBody {
	if (!isRecord(value)) {
		throw error(400, 'request body must be an object');
	}
	const requestId = String(value.requestId ?? '').trim();
	const sessionId = String(value.sessionId ?? '').trim();
	if (!requestId || !sessionId || !Array.isArray(value.items)) {
		throw error(400, 'requestId, sessionId, and items are required');
	}
	const items = value.items.map((item, index) => parseItem(item, index));
	return { requestId, sessionId, items };
}

function parseItem(value: unknown, index: number): ScanReviewItemInput {
	if (!isRecord(value)) {
		throw error(400, `items[${index}] must be an object`);
	}
	if (!isRecord(value.selectedCandidate)) {
		throw error(400, `items[${index}].selectedCandidate is required`);
	}
	const candidate = value.selectedCandidate;
	const catalogCardId = String(candidate.catalogCardId ?? '').trim();
	const canonicalCardId = String(candidate.canonicalCardId ?? '').trim();
	const name = String(candidate.name ?? '').trim();
	if (!catalogCardId || !canonicalCardId || !name) {
		throw error(
			400,
			`items[${index}].selectedCandidate requires catalogCardId, canonicalCardId, and name`
		);
	}
	return {
		id: value.id === undefined ? undefined : String(value.id),
		scanArtifactId: String(value.scanArtifactId ?? ''),
		selectedCandidate: {
			catalogCardId,
			canonicalCardId,
			name,
			oracleId: String(candidate.oracleId ?? ''),
			setCode: String(candidate.setCode ?? ''),
			collectorNumber: String(candidate.collectorNumber ?? ''),
			imageUri: String(candidate.imageUri ?? ''),
			similarityScore: Number(candidate.similarityScore ?? 0),
			ocrScore: Number(candidate.ocrScore ?? 0),
			finalScore: Number(candidate.finalScore ?? 0),
			matchReason: String(candidate.matchReason ?? 'manual_review')
		},
		finish: value.finish === undefined ? undefined : String(value.finish),
		condition: value.condition === undefined ? undefined : String(value.condition),
		quantity: value.quantity === undefined ? undefined : Number(value.quantity)
	};
}

export const POST = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = parseBody(await event.request.json());

	for (const item of body.items) {
		await upsertScanReviewItemEntry(auth, {
			id: item.id ?? crypto.randomUUID(),
			sessionId: body.sessionId,
			scanArtifactId: item.scanArtifactId,
			catalogCardId: item.selectedCandidate.catalogCardId,
			canonicalCardId: item.selectedCandidate.canonicalCardId,
			oracleId: item.selectedCandidate.oracleId,
			name: item.selectedCandidate.name,
			setCode: item.selectedCandidate.setCode,
			collectorNumber: item.selectedCandidate.collectorNumber ?? '',
			imageUri: item.selectedCandidate.imageUri ?? '',
			similarityScore: item.selectedCandidate.similarityScore ?? 0,
			ocrScore: item.selectedCandidate.ocrScore ?? 0,
			finalScore: item.selectedCandidate.finalScore ?? 0,
			matchReason: item.selectedCandidate.matchReason ?? 'manual_review',
			finish: item.finish ?? 'nonfoil',
			condition: item.condition ?? 'NM',
			quantity: item.quantity ?? 1
		});
	}

	const committed = await batchAddInventory(auth, {
		requestId: body.requestId,
		source: 'scan_review',
		items: body.items.map((item) => ({
			catalogCardId: item.selectedCandidate.catalogCardId,
			canonicalCardId: item.selectedCandidate.canonicalCardId,
			name: item.selectedCandidate.name,
			setCode: item.selectedCandidate.setCode,
			imageUri: item.selectedCandidate.imageUri ?? '',
			finish: item.finish ?? 'nonfoil',
			condition: item.condition ?? 'NM',
			quantity: item.quantity ?? 1
		}))
	});
	await updateScanSessionStatusEntry(auth, body.sessionId, 'committed');

	return json(committed);
};
