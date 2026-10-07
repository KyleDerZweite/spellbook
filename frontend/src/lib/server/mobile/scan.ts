import { error } from '@sveltejs/kit';
import { badRequestIfValidation } from './route-errors.ts';
export function scanHttpError(cause: unknown): never {
	if (
		cause &&
		typeof cause === 'object' &&
		'kind' in cause &&
		'status' in cause &&
		'message' in cause &&
		typeof cause.status === 'number' &&
		typeof cause.message === 'string' &&
		typeof cause.kind === 'string' &&
		[
			'ScanNotFound',
			'ScanClosed',
			'ScanProcessingFailed',
			'ScanUnavailable',
			'LegacyReplayEvidenceRequired',
			'ScanImageInvalid'
		].includes(cause.kind)
	)
		error(cause.status, {
			kind: cause.kind as import('@spellbook/contracts/scan.ts').ScanFailure['kind'],
			message: cause.message
		});
	badRequestIfValidation(cause);
}
