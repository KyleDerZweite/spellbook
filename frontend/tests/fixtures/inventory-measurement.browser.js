(async () => {
	if (location.pathname !== '/mtg/inventory') throw new Error('Open the real Inventory route.');
	await document.fonts.ready;
	const messages = [];
	const peak = {};
	const attributes = [
		'data-inventory-rendered',
		'data-inventory-cache-entries',
		'data-inventory-cache-pages',
		'data-inventory-contexts',
		'data-inventory-requests',
		'data-inventory-target-count',
		'data-measurements'
	];
	const sample = () => {
		for (const name of attributes) {
			for (const node of document.querySelectorAll(`[${name}]`)) {
				const value = Number(node.getAttribute(name));
				if (Number.isFinite(value)) peak[name] = Math.max(peak[name] ?? 0, value);
			}
		}
		peak.rows = Math.max(
			peak.rows ?? 0,
			document.querySelectorAll('li[data-inventory-index]').length
		);
	};
	const error = (event) => messages.push(String(event.message ?? event.reason));
	const observer = new MutationObserver(sample);
	observer.observe(document.documentElement, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeFilter: attributes
	});
	window.addEventListener('error', error);
	window.addEventListener('unhandledrejection', error);
	const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	try {
		sample();
		for (let i = 0; i < 7; i++) {
			window.scrollTo(0, document.documentElement.scrollHeight);
			await wait(400);
		}
		window.scrollTo(0, 0);
		await wait(800);
		sample();
		const result = {
			url: location.href,
			viewport: { width: innerWidth, height: innerHeight },
			errors: messages,
			peak,
			rowsAfterReturn: document.querySelectorAll('li[data-inventory-index]').length,
			span: [
				document
					.querySelector('[data-inventory-span-start]')
					?.getAttribute('data-inventory-span-start'),
				document.querySelector('[data-inventory-span-end]')?.getAttribute('data-inventory-span-end')
			]
		};
		window.__inventoryMeasurementResult = result;
		if (messages.length)
			throw new Error(`Inventory measurement: ${messages.length} browser errors; ${messages[0]}`);
		if (
			peak.rows > 200 ||
			peak['data-inventory-cache-entries'] > 1000 ||
			peak['data-inventory-cache-pages'] > 20 ||
			peak['data-inventory-contexts'] > 4 ||
			peak['data-inventory-requests'] > 3 ||
			peak['data-inventory-target-count'] > 8
		)
			throw new Error('Inventory resource bound exceeded.');
		if (!result.rowsAfterReturn) throw new Error('No real Inventory rows after return.');
		return result;
	} finally {
		observer.disconnect();
		window.removeEventListener('error', error);
		window.removeEventListener('unhandledrejection', error);
	}
})();
