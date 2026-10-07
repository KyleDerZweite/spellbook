import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
import type { SubmitFunction } from '$app/forms';

/** Shared lifecycle for group forms; the server owns validation and persistence. */
export class GroupMutation {
	pending = $state(false);
	error = $state('');
	private pendingRequests = new Map<string, string>();

	constructor(
		private onSuccess: () => void,
		private refresh: () => Promise<void>,
		private account: () => string
	) {}

	submit: SubmitFunction = ({ cancel, action, formData }) => {
		if (this.pending) {
			cancel();
			return;
		}
		const account = this.account();
		const payload =
			account +
			action.pathname +
			action.search +
			JSON.stringify([...formData.entries()].filter(([name]) => name !== 'requestId'));
		const requestId = this.pendingRequests.get(payload) ?? crypto.randomUUID();
		this.pendingRequests.set(payload, requestId);
		formData.set('requestId', requestId);
		const write = workspaceSavedState.beginWrite(['inventory']);
		this.pending = true;
		this.error = '';
		return async ({ result, update }) => {
			try {
				if (!write.current()) return;
				if (result.type === 'success' && result.data?.success) {
					this.pendingRequests.delete(payload);
					await update({ reset: false, refreshAll: false, navigate: false });
					if (!write.current() || account !== this.account()) return;
					await this.refresh();
					if (write.current() && account === this.account()) this.onSuccess();
				} else if (result.type === 'redirect') await update({ reset: false });
				else
					this.error =
						result.type === 'failure' && typeof result.data?.message === 'string'
							? result.data.message
							: 'Could not save this change. Try again.';
			} catch {
				this.error = 'Could not refresh inventory. Reload before trying again.';
			} finally {
				write.complete();
				this.pending = false;
			}
		};
	};
}
