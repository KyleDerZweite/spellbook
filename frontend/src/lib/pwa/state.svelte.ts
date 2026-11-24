interface InstallPrompt extends Event {
	prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallResult = 'accepted' | 'dismissed' | 'unavailable' | 'failed';

/** Shell owns the browser listeners; reusable PWA components only consume this state. */
export function createPwaState() {
	let standalone = $state(false);
	let online = $state(true);
	let canInstall = $state(false);
	let installing = $state(false);
	let installPrompt: InstallPrompt | undefined;
	let registration: ServiceWorkerRegistration | undefined;
	let stop: (() => void) | undefined;

	return {
		get standalone() {
			return standalone;
		},
		get online() {
			return online;
		},
		get canInstall() {
			return canInstall;
		},
		get installing() {
			return installing;
		},
		start() {
			if (stop) return stop;
			let active = true;
			const cleanups: Array<() => void> = [];
			const display = window.matchMedia('(display-mode: standalone)');
			const updateDisplay = () => {
				standalone =
					display.matches ||
					(navigator as Navigator & { standalone?: boolean }).standalone === true;
			};
			const updateOnline = () => {
				online = navigator.onLine;
			};
			const beforeInstall = (event: Event) => {
				if (!('prompt' in event) || typeof event.prompt !== 'function') return;
				event.preventDefault();
				installPrompt = event as InstallPrompt;
				canInstall = true;
			};
			const installed = () => {
				installPrompt = undefined;
				canInstall = false;
				updateDisplay();
			};
			updateDisplay();
			updateOnline();
			display.addEventListener('change', updateDisplay);
			window.addEventListener('online', updateOnline);
			window.addEventListener('offline', updateOnline);
			window.addEventListener('beforeinstallprompt', beforeInstall);
			window.addEventListener('appinstalled', installed);
			cleanups.push(() => {
				display.removeEventListener('change', updateDisplay);
				window.removeEventListener('online', updateOnline);
				window.removeEventListener('offline', updateOnline);
				window.removeEventListener('beforeinstallprompt', beforeInstall);
				window.removeEventListener('appinstalled', installed);
			});
			if ('serviceWorker' in navigator) {
				let checking = false;
				const check = async () => {
					if (!registration || !online || checking) return;
					checking = true;
					try {
						await registration.update();
					} catch {
						// A transient network failure can be retried at the next check.
					} finally {
						checking = false;
					}
				};
				// SvelteKit owns registration. Apply an already prepared worker on fresh entry only.
				void navigator.serviceWorker.ready
					.then((value) => {
						if (!active) return;
						registration = value;
						void check();
						value.waiting?.postMessage({ type: 'SKIP_WAITING' });
					})
					.catch(() => {});
				const timer = setInterval(() => void check(), 30 * 60_000);
				cleanups.push(() => clearInterval(timer));
			}
			stop = () => {
				active = false;
				cleanups.forEach((cleanup) => cleanup());
				installPrompt = undefined;
				registration = undefined;
				canInstall = false;
				stop = undefined;
			};
			return stop;
		},
		async install(): Promise<InstallResult> {
			const prompt = installPrompt;
			if (!prompt || installing) return 'unavailable';
			installPrompt = undefined;
			canInstall = false;
			installing = true;
			try {
				return (await prompt.prompt()).outcome;
			} catch {
				return 'failed';
			} finally {
				installing = false;
			}
		}
	};
}

export const pwaState = createPwaState();
