import type { RequestHandler } from './$types';
import { readJsonObject, readNumber, readString, requireUuid } from '#lib/server/http/request.ts';
import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { commitScanReview } from '#lib/server/data/scan.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';

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
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBody(value: unknown): ScanReviewCommitBody {
	if (!isRecord(value)) {
		throw error(400, 'request body must be an object');
	}
	const requestId = readString(value.requestId, 'requestId').trim();
	const sessionId = requireUuid(value.sessionId, 'sessionId');
	if (
		!requestId ||
		!Array.isArray(value.items) ||
		value.items.length < 1 ||
		value.items.length > 100
	) {
		throw error(400, 'requestId and 1 to 100 review items are required');
	}
	const items = value.items.map((item, index) => parseItem(item, index));
	return { requestId, sessionId, items };
}

function parseScore(value: unknown, name: string): number {
	const score = readNumber(value, name);
	if (!Number.isInteger(score) || score < 0 || score > 100)
		error(400, `${name} must be an integer from 0 to 100`);
	return score;
}

function parseQuantity(value: unknown): number {
	const quantity = readNumber(value, 'quantity', 1);
	if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647)
		error(400, 'quantity must be a positive 32-bit integer');
	return quantity;
}

function parseItem(value: unknown, index: number): ScanReviewItemInput {
	if (!isRecord(value)) {
		throw error(400, `items[${index}] must be an object`);
	}
	if (!isRecord(value.selectedCandidate)) {
		throw error(400, `items[${index}].selectedCandidate is required`);
	}
	const candidate = value.selectedCandidate;
	const catalogCardId = readString(
		candidate.catalogCardId,
		'selectedCandidate.catalogCardId'
	).trim();
	const canonicalCardId = readString(
		candidate.canonicalCardId,
		'selectedCandidate.canonicalCardId'
	).trim();
	const name = readString(candidate.name, 'selectedCandidate.name').trim();
	if (!catalogCardId || !canonicalCardId || !name) {
		throw error(
			400,
			`items[${index}].selectedCandidate requires catalogCardId, canonicalCardId, and name`
		);
	}
	return {
		id: value.id === undefined ? undefined : requireUuid(value.id, `items[${index}].id`),
		scanArtifactId: requireUuid(value.scanArtifactId, `items[${index}].scanArtifactId`),
		selectedCandidate: {
			catalogCardId,
			canonicalCardId,
			name,
			oracleId: readString(candidate.oracleId, 'selectedCandidate.oracleId'),
			setCode: readString(candidate.setCode, 'selectedCandidate.setCode'),
			collectorNumber: readString(candidate.collectorNumber, 'selectedCandidate.collectorNumber'),
			imageUri: readString(candidate.imageUri, 'selectedCandidate.imageUri'),
			similarityScore: parseScore(candidate.similarityScore, 'selectedCandidate.similarityScore'),
			ocrScore: parseScore(candidate.ocrScore, 'selectedCandidate.ocrScore'),
			finalScore: parseScore(candidate.finalScore, 'selectedCandidate.finalScore'),
			matchReason: readString(
				candidate.matchReason,
				'selectedCandidate.matchReason',
				'manual_review'
			)
		},
		finish: readString(value.finish, `items[${index}].finish`, 'nonfoil'),
		condition: readString(value.condition, `items[${index}].condition`, 'NM'),
		quantity: parseQuantity(value.quantity)
	};
}

export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = parseBody(await readJsonObject(event.request));

	try {
		return json(
			await commitScanReview(
				auth.user.accountId,
				body.requestId,
				body.sessionId,
				body.items.map((item) => ({
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
				}))
			)
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
