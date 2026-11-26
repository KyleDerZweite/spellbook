import type { Attachment } from 'svelte/attachments';
import {
	cardImageCache,
	isCacheableScryfallImageUrl,
	type ResolvedCardImage
} from './image-cache.ts';
import { observeLazyElement } from './lazy-observer.ts';

const isBrowser = () => typeof window !== 'undefined';

/**
 * Returns the initial `src` attribute for a card `<img>`.
 * On SSR (or for non-Scryfall URLs), returns the original URL directly for progressive enhancement.
 * In the browser for cacheable Scryfall URLs, returns `undefined` so `cachedCardImage` resolves
 * the image from IndexedDB before the browser initiates a network fetch.
 */
export function cardImageSrc(url: string | null | undefined): string | undefined {
	if (!url) return undefined;
	if (!isBrowser() || !isCacheableScryfallImageUrl(url)) return url;
	return undefined;
}

/**
 * Svelte 5 attachment that loads Scryfall card images through the browser IndexedDB LRU cache
 * and revokes object URLs cleanly when the element unmounts or its source changes.
 */
export function cachedCardImage(url: string | null | undefined): Attachment<HTMLImageElement> {
	return (image) => {
		if (!url || !isBrowser() || !isCacheableScryfallImageUrl(url)) return;

		let activeHandle: ResolvedCardImage | null = null;
		let fellBackToRaw = false;
		const controller = new AbortController();

		const handleError = (event: Event) => {
			if (!fellBackToRaw && image.src !== url) {
				fellBackToRaw = true;
				event.stopImmediatePropagation();
				image.src = url;
			}
		};
		image.addEventListener('error', handleError);

		const syncHit = cardImageCache.acquireSync(url);
		if (syncHit) {
			activeHandle = syncHit;
			image.src = syncHit.src;
			return () => {
				image.removeEventListener('error', handleError);
				activeHandle?.release();
				activeHandle = null;
			};
		}

		const startAcquire = () => {
			if (controller.signal.aborted) return;
			void cardImageCache.acquire(url, { signal: controller.signal }).then((handle) => {
				if (controller.signal.aborted) {
					handle.release();
					return;
				}
				activeHandle = handle;
				image.src = handle.src;
			});
		};

		const stopObserving =
			image.getAttribute('loading') === 'lazy'
				? observeLazyElement(image, startAcquire)
				: (startAcquire(), () => {});

		return () => {
			controller.abort();
			stopObserving();
			image.removeEventListener('error', handleError);
			activeHandle?.release();
			activeHandle = null;
		};
	};
}
