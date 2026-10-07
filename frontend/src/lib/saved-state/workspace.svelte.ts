import { WorkspaceSavedState, type ResourceSubscription } from './workspace.ts';
import { SAVED_STATE_PATH } from '@spellbook/contracts/saved-state.ts';
let version = $state(0);
const core = new WorkspaceSavedState({
	source: () => {
		const source = new EventSource(SAVED_STATE_PATH);
		return {
			get readyState() {
				return source.readyState;
			},
			close: () => source.close(),
			addEventListener(name, listener) {
				source.addEventListener(name, (event) =>
					listener({ data: event instanceof MessageEvent ? event.data : '{}' })
				);
			},
			set onerror(listener) {
				source.onerror = listener;
			},
			get onerror() {
				return null;
			}
		};
	},
	session: async (signal) =>
		(await fetch('/api/auth/session', { cache: 'no-store', signal })).status,
	visible: () => document.visibilityState === 'visible',
	listen: (resume) => {
		const visible = () => {
			if (document.visibilityState === 'visible') resume();
		};
		document.addEventListener('visibilitychange', visible);
		window.addEventListener('online', resume);
		return () => {
			document.removeEventListener('visibilitychange', visible);
			window.removeEventListener('online', resume);
		};
	},
	changed: () => version++
});
export const workspaceSavedState = {
	beginWrite: core.beginWrite.bind(core),
	start: core.start.bind(core),
	stop: core.stop.bind(core),
	expire: core.expire.bind(core),
	invalidate: core.invalidate.bind(core),
	isActive: core.isActive.bind(core),
	getState() {
		version;
		return core.getState();
	},
	subscribe(input: Parameters<WorkspaceSavedState['subscribe']>[0]): ResourceSubscription {
		const resource = core.subscribe(input);
		return {
			...resource,
			getState() {
				version;
				return resource.getState();
			}
		};
	}
};
