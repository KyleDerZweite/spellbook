import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	cancelWheelScroll,
	smoothWheelScroll
} from '../../src/lib/components/ui/scroll-area/wheel.ts';

class ScrollElement extends EventTarget {
	scrollTop = 0;
	scrollHeight = 1000;
	clientHeight = 200;
	overflowY = 'auto';
	root: ScrollElement = this;
	closest() {
		return this.root;
	}
}

class MotionPreference extends EventTarget {
	matches = false;
}

function wheel(
	viewport: ScrollElement,
	properties: Partial<WheelEvent> = {},
	path: EventTarget[] = [viewport]
) {
	const event = Object.assign(new Event('wheel', { cancelable: true }), {
		deltaMode: 0,
		deltaY: 100,
		deltaX: 0,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		altKey: false,
		composedPath: () => path,
		...properties
	});
	viewport.dispatchEvent(event);
	return event;
}

describe('shared wheel scrolling', () => {
	let now: number;
	let frames: Map<number, FrameRequestCallback>;
	let preference: MotionPreference;
	let cleanup: () => void;
	let viewport: ScrollElement;

	function advance(milliseconds: number) {
		now += milliseconds;
		const pending = [...frames.values()];
		frames.clear();
		for (const callback of pending) callback(now);
	}

	beforeEach(() => {
		now = 0;
		frames = new Map();
		let nextFrame = 0;
		preference = new MotionPreference();
		vi.stubGlobal('window', { matchMedia: () => preference });
		vi.stubGlobal('HTMLElement', ScrollElement);
		vi.stubGlobal('getComputedStyle', (element: ScrollElement) => element);
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			frames.set(++nextFrame, callback);
			return nextFrame;
		});
		vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
		vi.spyOn(performance, 'now').mockImplementation(() => now);
		viewport = new ScrollElement();
		cleanup = smoothWheelScroll(viewport as unknown as HTMLElement);
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('eases a coarse notch over 100ms and accumulates following notches', () => {
		expect(wheel(viewport).defaultPrevented).toBe(true);
		expect(viewport.scrollTop).toBe(0);
		advance(30);
		expect(viewport.scrollTop).toBeGreaterThan(0);
		expect(viewport.scrollTop).toBeLessThan(100);
		wheel(viewport);
		advance(100);
		expect(viewport.scrollTop).toBe(200);
		expect(frames.size).toBe(0);
	});

	it('uses line wheel units and responds immediately to reversed direction', () => {
		viewport.scrollTop = 100;
		wheel(viewport, { deltaMode: 1, deltaY: 3 });
		advance(50);
		const beforeReverse = viewport.scrollTop;
		wheel(viewport, { deltaMode: 1, deltaY: -1 });
		advance(100);
		expect(viewport.scrollTop).toBe(beforeReverse - 16);
	});

	it.each([
		{ deltaY: 17.5 },
		{ deltaY: 40 },
		{ deltaX: 2 },
		{ ctrlKey: true },
		{ metaKey: true },
		{ shiftKey: true },
		{ altKey: true },
		{ deltaMode: 2 },
		{ deltaY: 0 }
	])('leaves precision, horizontal and modified input native: %o', (properties) => {
		wheel(viewport);
		expect(wheel(viewport, properties).defaultPrevented).toBe(false);
		expect(frames.size).toBe(0);
	});

	it('leaves nested scroll panes and boundary chaining native', () => {
		const nested = new ScrollElement();
		expect(wheel(viewport, {}, [nested, viewport]).defaultPrevented).toBe(false);
		viewport.scrollTop = 800;
		expect(wheel(viewport).defaultPrevented).toBe(false);
		viewport.scrollTop = 0;
		expect(wheel(viewport, { deltaY: -100 }).defaultPrevented).toBe(false);
	});

	it('clamps large wheel requests to available content', () => {
		wheel(viewport, { deltaY: 1200 });
		advance(100);
		expect(viewport.scrollTop).toBe(800);
	});

	it.each(['pointerdown', 'touchstart', 'keydown'])('cancels for manual %s input', (type) => {
		wheel(viewport);
		viewport.dispatchEvent(new Event(type));
		advance(100);
		expect(viewport.scrollTop).toBe(0);
	});

	it('cancels when the scrollbar outside the viewport receives pointer input', () => {
		cleanup();
		viewport.root = new ScrollElement();
		cleanup = smoothWheelScroll(viewport as unknown as HTMLElement);
		wheel(viewport);
		viewport.root.dispatchEvent(new Event('pointerdown'));
		expect(frames.size).toBe(0);
	});

	it('cancels when restoring directly or through the explicit cancellation API', () => {
		wheel(viewport);
		viewport.scrollTop = 321;
		advance(100);
		expect(viewport.scrollTop).toBe(321);
		wheel(viewport);
		cancelWheelScroll(viewport as unknown as HTMLElement);
		viewport.scrollTop = 42;
		advance(100);
		expect(viewport.scrollTop).toBe(42);
	});

	it('honors reduced motion initially and while easing', () => {
		preference.matches = true;
		expect(wheel(viewport).defaultPrevented).toBe(false);
		preference.matches = false;
		wheel(viewport);
		preference.matches = true;
		preference.dispatchEvent(new Event('change'));
		expect(frames.size).toBe(0);
	});

	it('removes listeners and pending animation on cleanup', () => {
		wheel(viewport);
		cleanup();
		expect(frames.size).toBe(0);
		expect(wheel(viewport).defaultPrevented).toBe(false);
	});
});
