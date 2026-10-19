(async () => {
	if (location.pathname !== '/mtg/dashboard') throw new Error('Start on the active Dashboard.');
	/** @type {{accountId:string,deckId:string,query:string,catalogCardId:string,canonicalCardId:string,allowInventoryWrite:boolean}} */
	const config = Reflect.get(window, '__deckSearchStartupConfig');
	if (!config?.allowInventoryWrite)
		throw new Error('Confirm writes to an owned disposable fixture.');
	const previous = Reflect.get(window, '__deckSearchStartup');
	if (previous) previous.cleanup();
	const nativeFetch = window.fetch.bind(window);
	const session = await nativeFetch('/api/auth/session').then((response) => response.json());
	if (session.user?.accountId !== config.accountId) throw new Error('Fixture account mismatch.');
	const path = '/api/mobile/v1/mtg/decks/search?q=' + encodeURIComponent(config.query);
	const initial = await nativeFetch(path).then((response) => response.json());
	if (!initial.hits?.some((/** @type {{id:string}} */ card) => card.id === config.catalogCardId))
		throw new Error('The actual Catalog query must contain the fixture Printing.');
	const link = document.querySelector('nav a[href="/mtg/decks"]');
	if (!(link instanceof HTMLAnchorElement)) throw new Error('Deck navigation is unavailable.');
	const originalHref = link.getAttribute('href');
	function gate() {
		let release = () => {};
		const promise = new Promise((resolve) => (release = () => resolve(undefined)));
		return { promise, release };
	}
	/** @typedef {{release:()=>void,promise:Promise<unknown>,signal:AbortSignal|undefined,owned?:Record<string,number>}} Pending */
	/** @type {Pending[]} */
	const held = [];
	/** @type {ReturnType<typeof gate>|undefined} */
	let write;
	let hold = true;
	const patchedFetch = async (/** @type {Parameters<typeof fetch>} */ ...args) => {
		const [input, options] = args;
		const url = new URL(input instanceof Request ? input.url : input, location.href);
		// Preserve initiation order even when the coordinated response arrives first.
		/** @type {Pending|undefined} */
		const pending =
			hold && url.pathname === '/api/mobile/v1/mtg/decks/search'
				? {
						...gate(),
						signal: options?.signal ?? (input instanceof Request ? input.signal : undefined)
					}
				: undefined;
		if (pending) held.push(pending);
		const method = options?.method ?? (input instanceof Request ? input.method : 'GET');
		if (
			hold &&
			method === 'POST' &&
			url.pathname === '/mtg/decks' &&
			url.searchParams.has('/addCard')
		) {
			write = gate();
			await write.promise;
		}
		const response = await nativeFetch(...args);
		if (!hold || !pending) return response;
		const value = await response.clone().json();
		pending.owned = value.ownedByCanonical;
		await pending.promise;
		return response;
	};
	/** @type {Array<{topics:string[]}>} */
	const events = [];
	const source = new EventSource('/api/account/events');
	source.addEventListener('invalidate', (event) => events.push(JSON.parse(event.data)));
	/** @param {number} ms */
	const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	async function until(/** @type {()=>boolean} */ condition) {
		const deadline = performance.now() + 7000;
		while (!condition()) {
			if (performance.now() > deadline) throw new Error('Search startup scenario timed out.');
			await wait(25);
		}
	}
	const view = () => {
		const input = [...document.querySelectorAll('.catalog-row input[name="catalogCardId"]')].find(
			(node) => node instanceof HTMLInputElement && node.value === config.catalogCardId
		);
		return {
			busy: document.querySelector('.catalog-results')?.getAttribute('aria-busy'),
			text: input?.closest('.catalog-row')?.querySelector('.muted')?.textContent?.trim()
		};
	};
	const cleanup = () => {
		hold = false;
		if (window.fetch === patchedFetch) window.fetch = nativeFetch;
		for (const response of held) response.release();
		write?.release();
		source.close();
		if (originalHref !== null) link.setAttribute('href', originalHref);
	};
	const ready = async () => {
		await until(() => !!held[0]?.owned && view().busy === 'true' && !!view().text);
		if (held[0].signal?.aborted) throw new Error('The initial Search was already replaced.');
		return { view: view(), owned: held[0].owned };
	};
	const verify = async (/** @type {'invalidate'|'write'} */ mode) => {
		try {
			await ready();
			if (mode === 'invalidate') {
				await until(() => source.readyState === EventSource.OPEN);
				const start = events.length;
				const response = await nativeFetch('/api/mobile/v1/mtg/inventory', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						requestId: crypto.randomUUID(),
						source: 'mobile',
						items: [
							{
								catalogCardId: config.catalogCardId,
								finish: 'nonfoil',
								condition: 'NM',
								quantity: 1
							}
						]
					})
				});
				if (!response.ok) throw new Error('Fixture Inventory write failed.');
				await until(() => events.slice(start).some((event) => event.topics.includes('inventory')));
			} else await until(() => !!write);
			await wait(150);
			const before = view();
			held[0].release();
			await wait(150);
			const afterOld = view();
			const actual = await nativeFetch(path).then((response) => response.json());
			const result = {
				mode,
				before,
				afterOld,
				oldOwned: held[0].owned?.[config.canonicalCardId] ?? 0,
				actualOwned: actual.ownedByCanonical[config.canonicalCardId] ?? 0,
				events: [...events]
			};
			Object.assign(window, { __deckSearchStartupResult: result });
			if (before.busy !== 'true' || afterOld.busy !== 'true')
				throw new Error(`Initial Search published across ${mode}: ${JSON.stringify(result)}`);
			cleanup();
			await until(
				() => view().busy === 'false' && !!view().text?.endsWith(`· ${result.actualOwned} owned`)
			);
			return { ...result, recovered: view() };
		} finally {
			cleanup();
		}
	};
	window.fetch = patchedFetch;
	link.href =
		'/mtg/decks?' + new URLSearchParams({ deck: config.deckId, flow: 'search', q: config.query });
	Object.assign(window, { __deckSearchStartup: { ready, verify, cleanup } });
	return { href: link.href, initialOwned: initial.ownedByCanonical[config.canonicalCardId] ?? 0 };
})();
