import { expect, it, vi } from 'vitest';
import { loadReferencePrice } from '#lib/valuation/read.ts';

const input = { printingId: 'printing', entryId: 'entry', finish: 'nonfoil' } as const;
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}
it('does not parse a response for an obsolete account or inspector request', async () => {
	const response = deferred<Response>();
	let current = true;
	const read = loadReferencePrice(
		input,
		new AbortController().signal,
		() => current,
		() => response.promise
	);
	const reply = new Response('{}');
	const json = vi.spyOn(reply, 'json');
	current = false;
	response.resolve(reply);
	expect(await read).toBeUndefined();
	expect(json).not.toHaveBeenCalled();
});
it('ignores late JSON after a confirmed quantity revision starts a new request', async () => {
	const json = deferred<unknown>();
	const reply = new Response('{}');
	vi.spyOn(reply, 'json').mockImplementation(() => json.promise);
	let current = true;
	const read = loadReferencePrice(
		input,
		new AbortController().signal,
		() => current,
		async () => reply
	);
	await Promise.resolve();
	current = false;
	json.resolve({ results: [{ quantity: 2 }] });
	expect(await read).toBeUndefined();
});
it('requests authoritative quantity using only entry IDs and exposes a removed entry', async () => {
	let body: unknown;
	await expect(
		loadReferencePrice(
			input,
			new AbortController().signal,
			() => true,
			async (_url, init) => {
				body = JSON.parse(String(init.body));
				return new Response('{}', { status: 404 });
			}
		)
	).rejects.toThrow('This Inventory entry is no longer available.');
	expect(body).toEqual({ entryIds: ['entry'] });
});
