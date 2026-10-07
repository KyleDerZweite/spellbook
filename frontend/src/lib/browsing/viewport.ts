export type BrowseViewport = Window | HTMLElement;

/** Geometry uses the explicit window or modal host, never an inferred overflow ancestor. */
export function viewportGeometry(
	wrapper: Pick<DOMRect, 'top' | 'width'>,
	viewport: { top: number; height: number }
) {
	return {
		width: wrapper.width,
		height: viewport.height,
		visibleTop: Math.max(0, viewport.top - wrapper.top)
	};
}
export function measureBrowseViewport(host: BrowseViewport, wrapper: HTMLElement) {
	const windowHost = host === window;
	const rect = windowHost ? null : (host as HTMLElement).getBoundingClientRect();
	return viewportGeometry(wrapper.getBoundingClientRect(), {
		top: rect?.top ?? 0,
		height: windowHost ? window.innerHeight : (host as HTMLElement).clientHeight
	});
}
export function browseScrollTop(host: BrowseViewport): number {
	return host === window ? window.scrollY : (host as HTMLElement).scrollTop;
}
export function scrollBrowseViewport(host: BrowseViewport, top: number): void {
	host.scrollTo({ top, behavior: 'instant' });
}
