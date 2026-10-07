import type { ReadLease } from './workspace.ts';
import { workspaceSavedState } from './workspace.svelte.ts';
/** Protected response decoding remains inside the caller's publication lease. */
export async function readSavedJSON<T>(path: string, lease: ReadLease): Promise<T | null> {
	if (!lease.current()) return null;
	const response = await fetch(path, { cache: 'no-store', signal: lease.signal });
	if (!lease.current()) return null;
	if (response.status === 401) {
		workspaceSavedState.expire();
		return null;
	}
	if (!response.ok)
		throw Error(
			response.status === 404
				? 'This saved target is no longer available.'
				: 'Saved changes could not be loaded. Try again.'
		);
	const value: T = await response.json();
	return lease.current() ? value : null;
}
