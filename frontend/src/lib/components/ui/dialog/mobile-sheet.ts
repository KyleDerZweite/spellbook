import { MediaQuery } from 'svelte/reactivity';

export const mobileSheet = new MediaQuery('(max-width: 640px)');

export function fitVisualViewport(content: HTMLElement) {
	const viewport = window.visualViewport;
	if (!viewport) return;

	function update() {
		if (!viewport) return;
		content.style.setProperty('--sheet-viewport-height', `${viewport.height}px`);
		content.style.setProperty(
			'--sheet-viewport-bottom',
			`${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`
		);
	}

	update();
	viewport.addEventListener('resize', update);
	viewport.addEventListener('scroll', update);
	return () => {
		viewport.removeEventListener('resize', update);
		viewport.removeEventListener('scroll', update);
		content.style.removeProperty('--sheet-viewport-height');
		content.style.removeProperty('--sheet-viewport-bottom');
	};
}
