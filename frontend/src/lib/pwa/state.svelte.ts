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
	let updateReady = $state(false);
	let updating = $state(false);
	let updateError = $state('');
	let installPrompt: InstallPrompt | undefined;
	let registration: ServiceWorkerRegistration | undefined;
	let stop: (() => void) | undefined;
	let reloadForUpdate = () => {};

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
		get updateReady() {
			return updateReady;
		},
		get updating() {
			return updating;
		},
		get updateError() {
			return updateError;
		},
		start() {
			if (stop) return stop;
			let active = true;
			let reloadRequested = false;
			let updateTimeout: ReturnType<typeof setTimeout> | undefined;
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
			const observe = (value: ServiceWorkerRegistration | undefined) => {
				if (!active || !value || registration === value) return;
				registration = value;
				const waiting = () => {
					updateReady = !!value.waiting;
				};
				const watchInstalling = () => {
					const worker = value.installing;
					if (!worker) return;
					worker.addEventListener('statechange', waiting);
					cleanups.push(() => worker.removeEventListener('statechange', waiting));
				};
				value.addEventListener('updatefound', watchInstalling);
				cleanups.push(() => value.removeEventListener('updatefound', watchInstalling));
				waiting();
				watchInstalling();
			};
			if ('serviceWorker' in navigator) {
				// SvelteKit owns registration. This observes both existing and first-load registrations.
				void navigator.serviceWorker
					.getRegistration()
					.then(observe)
					.catch(() => {});
				void navigator.serviceWorker.ready.then(observe).catch(() => {});
				const controllerChanged = () => {
					if (reloadRequested) {
						reloadRequested = false;
						clearTimeout(updateTimeout);
						window.location.reload();
					}
					updateReady = !!registration?.waiting;
				};
				navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
				cleanups.push(() =>
					navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged)
				);
			}
			reloadForUpdate = () => {
				const worker = registration?.waiting;
				if (!worker || updating) return;
				updating = true;
				updateError = '';
				reloadRequested = true;
				const failed = () => {
					reloadRequested = false;
					updating = false;
					updateError = 'The update could not finish. Try again when connected.';
				};
				try {
					worker.postMessage({ type: 'SKIP_WAITING' });
					updateTimeout = setTimeout(failed, 15_000);
				} catch {
					failed();
				}
			};
			stop = () => {
				active = false;
				clearTimeout(updateTimeout);
				cleanups.forEach((cleanup) => cleanup());
				installPrompt = undefined;
				registration = undefined;
				canInstall = false;
				updateReady = false;
				updating = false;
				stop = undefined;
				reloadForUpdate = () => {};
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
		},
		reloadForUpdate() {
			reloadForUpdate();
		}
	};
}

export const pwaState = createPwaState();
