import { expect, it, vi } from 'vitest';
import { InventoryTargetReads } from '#lib/inventory/targets.ts';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}
function fixture() {
	let context = {
		account: 'owner',
		generation: 1,
		active: true,
		targets: [{ id: 'a', lifetime: {} }]
	};
	const applied = vi.fn();
	const requests: ReturnType<
		typeof deferred<{ status: number; ok: boolean; json: () => Promise<{ entry: string }> }>
	>[] = [];
	const reads = new InventoryTargetReads<string>(
		() => context,
		() => {
			const request = deferred<{
				status: number;
				ok: boolean;
				json: () => Promise<{ entry: string }>;
			}>();
			requests.push(request);
			return request.promise;
		},
		applied
	);
	const response = (entry: string) => ({ status: 200, ok: true, json: async () => ({ entry }) });
	return {
		reads,
		requests,
		applied,
		response,
		get context() {
			return context;
		},
		set context(value) {
			context = value;
		}
	};
}

it('a pre-save GET cannot overwrite the newer post-save detail', async () => {
	const f = fixture();
	const before = f.reads.refresh();
	const after = f.reads.refresh();
	f.requests[1].resolve(f.response('saved Notes'));
	await after;
	f.requests[0].resolve(f.response('old Notes'));
	await before;
	expect(f.applied.mock.calls).toEqual([['a', 'saved Notes']]);
});
it('a response for a closed then reopened entry cannot populate the new lifetime', async () => {
	const f = fixture();
	const old = f.reads.refresh();
	f.context = { ...f.context, targets: [] };
	f.context = { ...f.context, targets: [{ id: 'a', lifetime: {} }] };
	f.requests[0].resolve(f.response('old lifetime'));
	await old;
	expect(f.applied).not.toHaveBeenCalled();
	const current = f.reads.refresh();
	f.requests[1].resolve(f.response('reopened'));
	await current;
	expect(f.applied).toHaveBeenCalledWith('a', 'reopened');
});
it('checks relevance again after JSON decoding and rejects obsolete missing targets', async () => {
	const f = fixture();
	const body = deferred<{ entry: string }>();
	const json = vi.fn(() => body.promise);
	const read = f.reads.refresh();
	f.requests[0].resolve({ status: 200, ok: true, json });
	await vi.waitFor(() => expect(json).toHaveBeenCalled());
	f.context = { ...f.context, generation: 2 };
	body.resolve({ entry: 'old revision' });
	await read;
	expect(f.applied).not.toHaveBeenCalled();
	const missing = f.reads.refresh();
	f.context = { ...f.context, targets: [] };
	f.requests[1].resolve({ status: 404, ok: false, json: async () => ({ entry: '' }) });
	await missing;
	expect(f.applied).not.toHaveBeenCalled();
});
it('rejects account changes and unmount after transport completion', async () => {
	const f = fixture();
	const read = f.reads.refresh();
	f.context = { ...f.context, account: 'other' };
	f.requests[0].resolve(f.response('private'));
	await read;
	expect(f.applied).not.toHaveBeenCalled();
	const unmounted = f.reads.refresh();
	f.context = { ...f.context, active: false };
	f.requests[1].resolve(f.response('unmounted'));
	await unmounted;
	expect(f.applied).not.toHaveBeenCalled();
});
