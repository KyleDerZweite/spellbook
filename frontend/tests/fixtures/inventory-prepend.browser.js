(async () => {
	if (location.pathname !== '/mtg/inventory') throw new Error('Open a deep Inventory range.');
	await document.fonts.ready;
	/** @param {number} ms */
	const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	async function readyControl() {
		const deadline = performance.now() + 5000;
		while (true) {
			const button = [...document.querySelectorAll('button')].find(
				(node) => node.textContent?.trim() === 'Load earlier entries'
			);
			const measured = Number(
				document.querySelector('[data-measurements]')?.getAttribute('data-measurements')
			);
			if (button && !button.disabled && measured > 0) return button;
			if (performance.now() > deadline) throw new Error('Earlier control is not ready.');
			await wait(25);
		}
	}
	let button = await readyControl();
	button.scrollIntoView({ block: 'center' });
	await wait(350);
	button = await readyControl();
	const start = Number(
		document.querySelector('[data-inventory-span-start]')?.getAttribute('data-inventory-span-start')
	);
	if (start <= 0) throw new Error('Open a deep Inventory range.');
	const row = [...document.querySelectorAll('li[data-inventory-entry]')].find((node) => {
		const top = node.getBoundingClientRect().top;
		return top > button.getBoundingClientRect().bottom && top < innerHeight;
	});
	const id = row?.getAttribute('data-inventory-entry');
	if (!row || !id) throw new Error('No visible real entry below the earlier control.');
	const before = {
		id,
		top: row.getBoundingClientRect().top,
		header: getComputedStyle(document.documentElement).getPropertyValue('--app-header-height')
	};
	button.click();
	const deadline = performance.now() + 5000;
	while (
		Number(
			document
				.querySelector('[data-inventory-span-start]')
				?.getAttribute('data-inventory-span-start')
		) === start
	) {
		if (performance.now() > deadline) throw new Error('Earlier range did not load.');
		await wait(25);
	}
	await wait(350);
	const current = [...document.querySelectorAll('li[data-inventory-entry]')].find(
		(node) => node.getAttribute('data-inventory-entry') === id
	);
	if (!current) throw new Error('The visible anchor entry disappeared.');
	const after = current.getBoundingClientRect().top;
	const result = { before, after, delta: after - before.top };
	Object.assign(window, { __inventoryPrependResult: result });
	if (Math.abs(result.delta) > 0.5) throw new Error(`Inventory anchor moved ${result.delta}px.`);
	return result;
})();
