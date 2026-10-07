import { untrack } from 'svelte';
import type { ProfileSettings } from '@spellbook/contracts/profile.ts';
import { authState } from '#lib/auth/state.svelte.ts';
import { workspaceSavedState } from './workspace.svelte.ts';
import { selectProfileSeed, selectAuthSeed } from '#lib/profile/saved.ts';
import type { ResourceSubscription } from './workspace.ts';
/** Shared saved Profile/header resource, without owning another transport. */
class SavedProfile {
	profile: ProfileSettings | null = $state(null);
	private resource?: ResourceSubscription;
	get status() {
		const status = workspaceSavedState.getState();
		return status === 'live' && this.resource?.getState().error ? 'offline' : status;
	}
	start() {
		if (this.resource) return;
		this.resource = workspaceSavedState.subscribe({
			topics: ['profile', 'inventory', 'decks'],
			clear: () => {
				this.profile = null;
				authState.user = null;
			},
			refresh: async (lease) => {
				const response = await fetch('/api/account/profile', {
					cache: 'no-store',
					signal: lease.signal
				});
				if (!lease.current()) return;
				if (response.status === 401) {
					workspaceSavedState.expire();
					return;
				}
				if (!response.ok) throw Error('Profile refresh unavailable. Try again.');
				const profile: ProfileSettings = await response.json();
				if (!lease.current()) return;
				if (!workspaceSavedState.isActive(profile.user.accountId)) {
					workspaceSavedState.expire();
					return;
				}
				this.profile = profile;
				authState.user = profile.user;
			}
		});
	}
	seedUser(user: ProfileSettings['user'] | null) {
		if (workspaceSavedState.getState() === 'expired') return;
		if (user && !workspaceSavedState.isActive(user.accountId)) return;
		authState.user = selectAuthSeed(authState.user, user);
	}
	seed(profile: ProfileSettings) {
		if (!workspaceSavedState.isActive(profile.user.accountId)) return;
		untrack(() => {
			this.profile = selectProfileSeed(this.profile, profile);
			authState.user = this.profile.user;
			this.refresh();
		});
	}
	refresh() {
		this.resource?.invalidate();
	}
	beginWrite() {
		return this.resource?.beginWrite();
	}
	stop() {
		this.resource?.dispose();
		this.resource = undefined;
		this.profile = null;
	}
}
export const savedProfile = new SavedProfile();
