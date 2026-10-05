(() => {
	const key = 'spellbook-theme';
	const media = window.matchMedia('(prefers-color-scheme: dark)');
	const valid = (value) => ['light', 'dark', 'system'].includes(value);
	let preference = 'system';
	try {
		const saved = localStorage.getItem(key);
		if (valid(saved)) preference = saved;
	} catch {
		// Storage may be disabled; the control still works for this page.
	}
	function apply() {
		const dark = preference === 'dark' || (preference === 'system' && media.matches);
		document.documentElement.dataset.theme = preference;
		document.documentElement.classList.toggle('dark', dark);
		document.documentElement.classList.toggle('light', !dark);
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute('content', dark ? '#101010' : '#fafafa');
		window.dispatchEvent(new Event('spellbook:theme-changed'));
	}
	window.addEventListener('spellbook:set-theme', (event) => {
		if (!valid(event.detail)) return;
		preference = event.detail;
		try {
			localStorage.setItem(key, preference);
		} catch {
			/* Use in-memory preference. */
		}
		apply();
	});
	window.addEventListener('storage', (event) => {
		if (event.key !== key && event.key !== null) return;
		preference = valid(event.newValue) ? event.newValue : 'system';
		apply();
	});
	media.addEventListener('change', apply);
	apply();
})();
