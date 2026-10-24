import { expect, it, vi } from 'vitest';

it('opens the canonical stream and probes the canonical session without caching after a failure', async () => {
	const urls: string[] = [];
	const sources: Source[] = [];
	class Source extends EventTarget {
		readyState = 0;
		onerror: (() => void) | null = null;
		close = vi.fn();
		constructor(url: string) {
			super();
			urls.push(url);
			sources.push(this);
		}
	}
	const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
	const window = new EventTarget();
	const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 401 }));
	vi.stubGlobal('EventSource', Source);
	vi.stubGlobal('document', document);
	vi.stubGlobal('window', window);
	vi.stubGlobal('fetch', request);
	const { workspaceSavedState } = await import('#lib/saved-state/workspace.svelte.ts');
	try {
		workspaceSavedState.start({ accountId: 'account', activation: 'canonical-transport' });
		sources[0].onerror!();
		await vi.waitFor(() => expect(workspaceSavedState.getState()).toBe('expired'));
		expect(request).toHaveBeenCalledOnce();
		expect(request.mock.calls[0][0]).toBe('/api/v1/auth/session');
		expect(request.mock.calls[0][1]).toMatchObject({
			cache: 'no-store',
			signal: expect.any(AbortSignal)
		});
		expect(sources[0].close).toHaveBeenCalledOnce();
		expect(urls).toEqual(['/api/v1/account/events']);
	} finally {
		workspaceSavedState.stop();
		vi.unstubAllGlobals();
	}
});
