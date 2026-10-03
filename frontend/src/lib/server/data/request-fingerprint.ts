import { createHash } from 'node:crypto';
import { ValidationError } from '$lib/server/mtg/validation';

export class RequestConflictError extends ValidationError {
	constructor(message = 'Request ID was already used for a different mutation') {
		super(message);
		this.name = 'RequestConflictError';
	}
}

export function mutationFingerprint(payload: unknown): string {
	const serialized = JSON.stringify(payload, (_key, value: unknown) => {
		if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
		return Object.fromEntries(
			Object.entries(value).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		);
	});
	if (serialized === undefined)
		throw new ValidationError('Mutation payload must be JSON serializable');
	return createHash('sha256').update(serialized).digest('hex');
}
