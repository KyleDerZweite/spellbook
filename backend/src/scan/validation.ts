import type { ScanStatus, ScanCandidate } from '@spellbook/contracts/scan.ts';
import { assertBoundedText, assertUuid, ValidationError } from '../mtg/validation.ts';

export class ScanError extends Error {
	constructor(
		public readonly kind:
			| 'ScanNotFound'
			| 'ScanClosed'
			| 'ScanProcessingFailed'
			| 'ScanUnavailable'
			| 'LegacyReplayEvidenceRequired'
			| 'ScanImageInvalid',
		message: string,
		public readonly status: number
	) {
		super(message);
	}
}
export function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new ValidationError('Expected a Scan object');
	return value as Record<string, unknown>;
}
export function text(value: unknown, field: string, max: number, optional = false): string {
	if (optional && value === undefined) return '';
	const result = assertBoundedText(value, field, max).trim();
	if (!optional && !result) throw new ValidationError(`${field} must not be empty`);
	return result;
}
export function score(value: unknown): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 2147483647)
		throw new ValidationError('Scan scores must be nonnegative 32-bit integers');
	return value;
}
export function status(value: unknown, count: number): ScanStatus {
	if (typeof value !== 'string' || !['matched', 'ambiguous', 'no_match', 'failed'].includes(value))
		throw new ValidationError('Invalid Scan result status');
	if (
		(value === 'matched' && count < 1) ||
		(value === 'ambiguous' && count < 2) ||
		((value === 'no_match' || value === 'failed') && count !== 0)
	)
		throw new ValidationError('Candidates do not match the Scan result status');
	return value as ScanStatus;
}
export function candidateDto(value: unknown): ScanCandidate {
	const c = record(value);
	const confidence = c.confidence;
	if (
		confidence !== undefined &&
		(typeof confidence !== 'number' ||
			!Number.isFinite(confidence) ||
			confidence < 0 ||
			confidence > 1)
	)
		throw new ValidationError('Invalid candidate confidence');
	return {
		catalogCardId: assertUuid(c.catalogCardId, 'catalogCardId'),
		canonicalCardId: assertUuid(c.canonicalCardId, 'canonicalCardId'),
		oracleId: assertUuid(c.oracleId, 'oracleId'),
		name: text(c.name, 'name', 500),
		setCode: text(c.setCode, 'setCode', 100),
		collectorNumber: text(c.collectorNumber, 'collectorNumber', 100, true),
		imageUri: text(c.imageUri, 'imageUri', 2000, true),
		similarityScore: score(c.similarityScore),
		ocrScore: score(c.ocrScore),
		finalScore: score(c.finalScore),
		matchReason: text(c.matchReason, 'matchReason', 500, true),
		...(confidence === undefined ? {} : { confidence: confidence as number })
	};
}
export function candidateArray(value: unknown): ScanCandidate[] {
	if (!Array.isArray(value) || value.length > 20)
		throw new ValidationError('Supply at most 20 Scan candidates');
	const rows = value.map(candidateDto);
	if (new Set(rows.map((c) => c.catalogCardId)).size !== rows.length)
		throw new ValidationError('Duplicate candidate printing');
	return rows;
}
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export function imageContentType(input: Uint8Array): string {
	const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
	if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
		return 'image/png';
	if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
	if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
		return 'image/webp';
	throw new ScanError('ScanImageInvalid', 'Scan image is not JPEG, PNG, or WebP', 415);
}
export function checkImage(bytes: Uint8Array, contentType?: string, fileName?: string) {
	if (!bytes.byteLength)
		throw new ScanError('ScanImageInvalid', 'Scan upload must not be empty', 400);
	if (bytes.byteLength > MAX_IMAGE_BYTES)
		throw new ScanError('ScanImageInvalid', 'Scan image exceeds 10 MiB', 413);
	const actual = imageContentType(bytes);
	if (contentType !== undefined && actual !== contentType)
		throw new ScanError('ScanImageInvalid', 'Scan image content does not match its MIME type', 415);
	if (fileName !== undefined && (!fileName.trim() || fileName.length > 255))
		throw new ValidationError('Invalid Scan file name');
	return actual;
}
