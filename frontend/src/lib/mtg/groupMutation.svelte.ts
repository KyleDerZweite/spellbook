import type { SubmitFunction } from '$app/forms';

/** Shared lifecycle for group forms; the server owns validation and persistence. */
export class GroupMutation {
	pending = $state(false);
	error = $state('');

	constructor(private onSuccess: () => void) {}

	submit: SubmitFunction = ({ cancel }) => {
		if (this.pending) {
			cancel();
			return;
		}
		this.pending = true;
		this.error = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'success' && result.data?.success) {
					await update({ reset: false });
					this.onSuccess();
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
