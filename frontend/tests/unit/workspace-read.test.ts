import { expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { readSavedJSON } from '#lib/saved-state/read.ts';

it('discards a held HTTP body when the submitted query changes during decode', async () => {
	let release!: () => void, decoding!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const decoded = new Promise<void>((resolve) => {
		decoding = resolve;
	});
	const server = createServer(async (_request, response) => {
		response.writeHead(200, { 'content-type': 'application/json' });
		response.write('{"hits":');
		await held;
		response.end('[]}');
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (!address || typeof address === 'string') throw Error('Missing test listener');
	const original = Response.prototype.json;
	const instrument = vi.spyOn(Response.prototype, 'json').mockImplementation(function (
		this: Response
	) {
		decoding();
		return original.call(this);
	});
	let query = 'submitted';
	const submittedQuery = query;
	try {
		const reading = readSavedJSON(`http://127.0.0.1:${address.port}/search`, {
			signal: new AbortController().signal,
			current: () => query === submittedQuery
		});
		await decoded;
		query = 'new input';
		release();
		expect(await reading).toBeNull();
	} finally {
		release();
		instrument.mockRestore();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});
