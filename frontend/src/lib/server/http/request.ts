import { error } from '@sveltejs/kit';

export function readString(value: unknown, name: string, fallback = ''): string {
	if (value === undefined) return fallback;
	if (typeof value !== 'string') error(400, `${name} must be a string`);
	return value;
}

export function readNumber(value: unknown, name: string, fallback = 0): number {
	if (value === undefined) return fallback;
	if (typeof value !== 'number' || !Number.isFinite(value))
		error(400, `${name} must be a finite number`);
	return value;
}

export async function readJsonObject(
	request: Request,
	maxBytes = 1024 * 1024
): Promise<Record<string, unknown>> {
	if (
		request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
	)
		error(415, 'Use application/json');
	const bytes = await readRequestBytes(request, maxBytes);
	let body: unknown;
	try {
		body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
	} catch {
		error(400, 'Invalid JSON body');
	}
	if (!body || typeof body !== 'object' || Array.isArray(body))
		error(400, 'A JSON object is required');
	return body as Record<string, unknown>;
}

export async function readRequestBytes(
	request: Request,
	maxBytes: number
): Promise<Uint8Array<ArrayBuffer>> {
	if (!request.body) error(400, 'A request body is required');
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			let chunk: ReadableStreamReadResult<Uint8Array>;
			try {
				chunk = await reader.read();
			} catch (cause) {
				if (cause && typeof cause === 'object' && 'status' in cause && cause.status === 413)
					error(413, 'Request body exceeds the size limit');
				error(400, 'Unable to read request body');
			}
			if (chunk.done) break;
			size += chunk.value.byteLength;
			if (size > maxBytes) {
				// adapter-node destroys the request socket on cancel, preventing a 413 response.
				error(413, 'Request body exceeds the size limit');
			}
			chunks.push(chunk.value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

export function requireUuid(value: unknown, name = 'id'): string {
	if (
		typeof value !== 'string' ||
		!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.trim())
	)
		error(400, `${name} must be a UUID`);
	return value.trim();
}

export function readQueryInteger(
	value: string | null,
	name: string,
	fallback: number,
	max = Number.MAX_SAFE_INTEGER,
	min = 0
): number {
	if (value === null) return fallback;
	const parsed = Number(value);
	if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < min || parsed > max)
		error(400, `${name} must be an integer between ${min} and ${max}`);
	return parsed;
}
