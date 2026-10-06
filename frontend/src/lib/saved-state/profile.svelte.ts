import { SAVED_STATE_PATH } from '@spellbook/contracts/saved-state.ts';
import type { ProfileSettings } from '@spellbook/contracts/profile.ts';
import { authState } from '#lib/auth/state.svelte.ts';

/** One cookie EventSource and one coalesced current Profile read per browser account. */
class SavedProfile {
	profile: ProfileSettings | null = $state(null);
	status: 'idle' | 'connecting' | 'live' | 'recovering' | 'offline' | 'expired' = $state('idle');
	private accountId: string | null = null;
	private source: EventSource | undefined;
	private controller: AbortController | undefined;
	private generation = 0;
	private refreshing = false;
	private again = false;
	private cleanup: (() => void) | undefined;
	start(accountId: string | null) {
		if (accountId === this.accountId) return;
		this.stop();
		this.accountId = accountId;
		if (!accountId) return;
		const generation = this.generation;
		const resume = () => {
			if (document.visibilityState === 'visible') {
				this.refresh();
				if (!this.source) this.connect();
			}
		};
		document.addEventListener('visibilitychange', resume);
		window.addEventListener('online', resume);
		this.cleanup = () => {
			document.removeEventListener('visibilitychange', resume);
			window.removeEventListener('online', resume);
		};
		if (generation === this.generation) this.connect();
	}
	private connect() {
		if (!this.accountId) return;
		this.status = 'connecting';
		const generation = this.generation;
		const source = new EventSource(SAVED_STATE_PATH);
		this.source = source;
		source.addEventListener('reset', () => {
			if (generation !== this.generation) return;
			this.status = 'live';
			this.refresh();
		});
		source.addEventListener('recovering', () => {
			if (generation === this.generation) this.status = 'recovering';
		});
		source.addEventListener('invalidate', (event) => {
			if (generation !== this.generation) return;
			try {
				const value = JSON.parse((event as MessageEvent).data);
				if (value.topics?.includes('profile')) this.refresh();
			} catch {
				/* Ignore malformed transport data. */
			}
		});
		source.addEventListener('auth-expired', () => {
			if (generation === this.generation) this.expire();
		});
		source.onerror = () => {
			if (generation !== this.generation) return;
			this.status = 'offline';
			void fetch('/api/auth/session', { cache: 'no-store' })
				.then((response) => {
					if (generation === this.generation && response.status === 401) this.expire();
				})
				.catch(() => {});
		};
	}
	seed(profile: ProfileSettings) {
		if (profile.user.accountId !== this.accountId) return;
		this.profile = {
			user: profile.user,
			card: profile.card,
			totals: profile.totals,
			statsError: profile.statsError
		};
		authState.user = profile.user;
		this.refresh();
	}
	refresh() {
		if (!this.accountId) return;
		if (this.refreshing) {
			this.again = true;
			return;
		}
		this.refreshing = true;
		const generation = this.generation;
		const controller = new AbortController();
		this.controller = controller;
		void (async () => {
			try {
				do {
					this.again = false;
					const response = await fetch('/api/account/profile', {
						cache: 'no-store',
						signal: controller.signal
					});
					if (generation !== this.generation) return;
					if (response.status === 401) {
						this.expire();
						return;
					}
					if (!response.ok) throw Error('Profile refresh unavailable');
					const profile: ProfileSettings = await response.json();
					if (generation !== this.generation) return;
					if (profile.user.accountId !== this.accountId) {
						this.expire();
						return;
					}
					this.profile = profile;
					authState.user = profile.user;
				} while (this.again && generation === this.generation);
			} catch {
				if (generation === this.generation) this.status = 'offline';
			} finally {
				if (generation === this.generation) {
					this.refreshing = false;
					this.controller = undefined;
				}
			}
		})();
	}
	private expire() {
		this.stop();
		this.status = 'expired';
		authState.user = null;
	}
	stop() {
		this.generation++;
		this.source?.close();
		this.source = undefined;
		this.controller?.abort();
		this.controller = undefined;
		this.cleanup?.();
		this.cleanup = undefined;
		this.profile = null;
		this.accountId = null;
		this.again = false;
		this.refreshing = false;
	}
}
export const savedProfile = new SavedProfile();
