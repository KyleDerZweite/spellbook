import type { SubmitFunction } from '$app/forms';

/** Shared lifecycle for group forms; the server owns validation and persistence. */
export class GroupMutation {
	pending = $state(false);
	error = $state('');

	constructor(
		private onSuccess: () => void,
		private refresh: () => Promise<void>,
		private account: () => string
	) {}

	submit: SubmitFunction = ({ cancel }) => {
		if (this.pending) {
			cancel();
			return;
		}
		const account = this.account();
		this.pending = true;
		this.error = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'success' && result.data?.success) {
					await update({ reset: false, refreshAll: false, navigate: false });
					if (account !== this.account()) return;
					await this.refresh();
					if (account === this.account()) this.onSuccess();
				} else if (result.type === 'redirect') await update({ reset: false });
				else
					this.error =
						result.type === 'failure' && typeof result.data?.message === 'string'
							? result.data.message
							: 'Could not save this change. Try again.';
			} catch {
				this.error = 'Could not refresh inventory. Reload before trying again.';
			} finally {
				this.pending = false;
			}
		};
	};
}
