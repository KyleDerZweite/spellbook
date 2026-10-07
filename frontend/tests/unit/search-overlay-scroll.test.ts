import { expect, it, vi } from 'vitest';
import { restoreBrowsePosition } from '../../src/lib/browsing/viewport.ts';

it('restores the numeric modal heading without scrolling its background window', () => {
	let backgroundTop = 600;
	const host = {
		scrollTop: 40,
		clientTop: 1,
		getBoundingClientRect: () => ({ top: 64 }),
		scrollTo: vi.fn()
	};
	const heading = {
		getBoundingClientRect: () => ({ top: 225 }),
		scrollIntoView: vi.fn(() => {
			backgroundTop = 0;
		})
	};
	restoreBrowsePosition(host, 0, heading, null);
	expect(backgroundTop).toBe(600);
	expect(host.scrollTo).toHaveBeenCalledWith({ top: 200, behavior: 'instant' });
	expect(heading.scrollIntoView).not.toHaveBeenCalled();
});

it('keeps restored modal positions independent of the background during query/page and history changes', () => {
	const background = { scrollTo: vi.fn() };
	const modal = {
		scrollTo: vi.fn(),
		scrollTop: 250,
		clientTop: 0,
		getBoundingClientRect: () => ({ top: 64 })
	};
	const heading = {
		scrollIntoView: background.scrollTo,
		getBoundingClientRect: () => ({ top: 84 })
	};
	restoreBrowsePosition(modal, 12345, heading, null);
	expect(modal.scrollTo).toHaveBeenLastCalledWith({ top: 12345, behavior: 'instant' });
	restoreBrowsePosition(modal, 0, heading, null);
	expect(modal.scrollTo).toHaveBeenLastCalledWith({ top: 270, behavior: 'instant' });
	expect(background.scrollTo).not.toHaveBeenCalled();
});

it('retains full-route feedback and result heading precedence with native window scrolling', () => {
	const host = { scrollTo: vi.fn() };
	const results = { scrollIntoView: vi.fn(), getBoundingClientRect: () => ({ top: 400 }) };
	const feedback = { scrollIntoView: vi.fn(), getBoundingClientRect: () => ({ top: 100 }) };
	restoreBrowsePosition(host, 10000, results, feedback);
	expect(feedback.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
	expect(host.scrollTo).not.toHaveBeenCalled();
	restoreBrowsePosition(host, 0, results, null);
	expect(results.scrollIntoView).toHaveBeenCalledOnce();
	restoreBrowsePosition(host, 600, results, null);
	expect(host.scrollTo).toHaveBeenCalledWith({ top: 600, behavior: 'instant' });
});
