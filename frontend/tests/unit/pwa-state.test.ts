import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPwaState } from '../../src/lib/pwa/state.svelte.ts';

function fixture(hasWaitingWorker = true) {
	const display = Object.assign(new EventTarget(), { matches: false });
	const worker = { postMessage: vi.fn() };
	const registration = Object.assign(new EventTarget(), {
		waiting: hasWaitingWorker ? worker : null,
		installing: null as (EventTarget & { state: string }) | null
	});
	const serviceWorker = Object.assign(new EventTarget(), {
		getRegistration: vi.fn().mockResolvedValue(registration),
		ready: Promise.resolve(registration)
	});
	const window = Object.assign(new EventTarget(), {
		matchMedia: vi.fn(() => display),
		location: { reload: vi.fn() }
	});
	const navigator = { serviceWorker, onLine: true, standalone: false };
	vi.stubGlobal('window', window);
	vi.stubGlobal('navigator', navigator);
	const state = createPwaState();
	const stop = state.start();
	return { state, stop, display, worker, registration, serviceWorker, window, navigator };
}

let current: ReturnType<typeof fixture>;
const settle = async () => {
	await Promise.resolve();
	await Promise.resolve();
};
beforeEach(() => {
	current = fixture();
});
afterEach(() => {
	current.stop();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('PWA browser lifecycle', () => {
	it('uses display mode or iOS standalone, independently of viewport size', () => {
		expect(current.window.matchMedia).toHaveBeenCalledExactlyOnceWith('(display-mode: standalone)');
		expect(current.state.standalone).toBe(false);
		current.display.matches = true;
		current.display.dispatchEvent(new Event('change'));
		expect(current.state.standalone).toBe(true);
		current.display.matches = false;
		current.navigator.standalone = true;
		current.display.dispatchEvent(new Event('change'));
		expect(current.state.standalone).toBe(true);
	});

	it('tracks online/offline events and removes its listeners', () => {
		current.navigator.onLine = false;
		current.window.dispatchEvent(new Event('offline'));
		expect(current.state.online).toBe(false);
		current.stop();
		current.navigator.onLine = true;
		current.window.dispatchEvent(new Event('online'));
		expect(current.state.online).toBe(false);
	});

	it('never activates or reloads a waiting worker without an explicit choice', async () => {
		await settle();
		expect(current.state.updateReady).toBe(true);
		expect(current.worker.postMessage).not.toHaveBeenCalled();
		current.serviceWorker.dispatchEvent(new Event('controllerchange'));
		expect(current.window.location.reload).not.toHaveBeenCalled();
		current.state.reloadForUpdate();
		expect(current.worker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'SKIP_WAITING' });
		expect(current.state.updating).toBe(true);
		expect(current.window.location.reload).not.toHaveBeenCalled();
		current.serviceWorker.dispatchEvent(new Event('controllerchange'));
		current.serviceWorker.dispatchEvent(new Event('controllerchange'));
		expect(current.window.location.reload).toHaveBeenCalledTimes(1);
	});

	it('notices an update installed later and keeps activation errors recoverable', async () => {
		current.stop();
		current = fixture(false);
		await settle();
		expect(current.state.updateReady).toBe(false);
		const installing = Object.assign(new EventTarget(), { state: 'installing' });
		current.registration.installing = installing;
		current.registration.dispatchEvent(new Event('updatefound'));
		current.registration.waiting = current.worker;
		installing.state = 'installed';
		installing.dispatchEvent(new Event('statechange'));
		expect(current.state.updateReady).toBe(true);
		current.worker.postMessage.mockImplementationOnce(() => {
			throw new Error('unavailable');
		});
		current.state.reloadForUpdate();
		expect(current.state.updating).toBe(false);
		expect(current.state.updateError).toContain('Try again');
		current.state.reloadForUpdate();
		expect(current.state.updating).toBe(true);
	});

	it('times out a stuck activation without reloading or losing the retry', async () => {
		vi.useFakeTimers();
		await settle();
		current.state.reloadForUpdate();
		vi.advanceTimersByTime(15_000);
		expect(current.state.updating).toBe(false);
		expect(current.state.updateError).toContain('Try again');
		current.serviceWorker.dispatchEvent(new Event('controllerchange'));
		expect(current.window.location.reload).not.toHaveBeenCalled();
	});

	it('defers the native install prompt to a user action and consumes it once', async () => {
		const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
			prompt: vi.fn().mockResolvedValue({ outcome: 'dismissed' })
		});
		current.window.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(current.state.canInstall).toBe(true);
		expect(event.prompt).not.toHaveBeenCalled();
		expect(await current.state.install()).toBe('dismissed');
		expect(await current.state.install()).toBe('unavailable');
		expect(event.prompt).toHaveBeenCalledTimes(1);
		expect(current.state.canInstall).toBe(false);
	});

	it('handles installation failures and appinstalled without claiming this browser tab is standalone', async () => {
		const event = Object.assign(new Event('beforeinstallprompt'), {
			prompt: vi.fn().mockRejectedValue(new Error('failed'))
		});
		current.window.dispatchEvent(event);
		expect(await current.state.install()).toBe('failed');
		expect(current.state.installing).toBe(false);
		current.window.dispatchEvent(
			Object.assign(new Event('beforeinstallprompt'), { prompt: vi.fn() })
		);
		current.window.dispatchEvent(new Event('appinstalled'));
		expect(current.state.canInstall).toBe(false);
		expect(current.state.standalone).toBe(false);
	});

	it('ignores registration promises that resolve after Shell is destroyed', async () => {
		current.stop();
		await settle();
		expect(current.state.updateReady).toBe(false);
		current.state.reloadForUpdate();
		expect(current.worker.postMessage).not.toHaveBeenCalled();
	});
});
