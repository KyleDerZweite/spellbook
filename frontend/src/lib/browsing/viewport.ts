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
export function scrollBrowseViewport(host: Pick<BrowseViewport, 'scrollTo'>, top: number): void {
	host.scrollTo({ top, behavior: 'instant' });
}

type RestorationViewport =
	| Pick<Window, 'scrollTo'>
	| {
			scrollTo: HTMLElement['scrollTo'];
			scrollTop: number;
			clientTop: number;
			getBoundingClientRect(): Pick<DOMRect, 'top'>;
	  };
type RestorationTarget = {
	scrollIntoView: HTMLElement['scrollIntoView'];
	getBoundingClientRect(): Pick<DOMRect, 'top'>;
};

/** Restore only the explicit host; scrollIntoView would also move a modal's background. */
export function restoreBrowsePosition(
	host: RestorationViewport,
	top: number,
	results: RestorationTarget | null,
	feedback: RestorationTarget | null
): void {
	const target = feedback ?? (top ? null : results);
	if (target) {
		if ('scrollTop' in host) {
			const offset =
				host.scrollTop +
				target.getBoundingClientRect().top -
				host.getBoundingClientRect().top -
				host.clientTop;
			scrollBrowseViewport(host, Math.max(0, offset));
		} else target.scrollIntoView({ block: 'start', behavior: 'instant' });
	} else if (top) scrollBrowseViewport(host, top);
}

/** Initial range zero keeps the workspace context visible; explicit entry reanchors remain separate. */
export function restoreInitialBrowsePosition(
	host: RestorationViewport,
	savedTop: number,
	anchorIndex: number,
	anchorTop: number,
	feedback: RestorationTarget | null = null
): void {
	if (feedback) restoreBrowsePosition(host, savedTop, null, feedback);
	else scrollBrowseViewport(host, savedTop || (anchorIndex > 0 ? anchorTop : 0));
}

/** Preserve negative clearance while the viewport is above the first rendered row. */
export function captureBrowseAnchor(
	relativeTop: number,
	indexAt: (top: number) => number,
	rowTop: (index: number) => number
) {
	const index = indexAt(Math.max(0, relativeTop));
	return { index, intra: relativeTop - rowTop(index) };
}

/** Keep an in-list row fixed while content above the list enters or leaves normal flow. */
export function browseOriginShift(
	previousTop: number,
	nextTop: number,
	scrollTop: number,
	clearance: number
): number {
	return scrollTop + clearance >= previousTop ? nextTop - previousTop : 0;
}

/** Resolve the same captured row against current measured offsets and list origin. */
export function browseAnchorScrollTop(
	origin: number,
	rowOffset: number,
	intra: number,
	clearance: number
): number {
	return Math.max(0, origin + rowOffset + intra - clearance);
}
