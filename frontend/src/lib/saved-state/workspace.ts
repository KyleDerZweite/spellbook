import { SAVED_STATE_TOPICS, type SavedStateTopic } from '@spellbook/contracts/saved-state.ts';
export type WorkspaceStatus = 'idle' | 'connecting' | 'live' | 'recovering' | 'offline' | 'expired';
export interface ReadLease {
	signal: AbortSignal;
	current(): boolean;
}
export interface ResourceStatus {
	stale: boolean;
	refreshing: boolean;
	error: string;
}
export interface WriteHandle {
	current(): boolean;
	complete(): void;
}
export interface ResourceSubscription {
	invalidate(): void;
	publication(): () => boolean;
	beginWrite(): WriteHandle;
	getState(): ResourceStatus;
	dispose(): void;
}
type Source = {
	readyState: number;
	close(): void;
	addEventListener(name: string, listener: (event: { data: string }) => void): void;
	onerror: (() => void) | null;
};
interface Environment {
	source(): Source;
	session(signal: AbortSignal): Promise<number>;
	visible(): boolean;
	listen(resume: () => void): () => void;
	changed(): void;
}
interface Resource {
	topics: readonly SavedStateTopic[];
	refresh(lease: ReadLease): Promise<void>;
	clear(): void;
	version: number;
	generation: number;
	writes: number;
	disposed: boolean;
	pending: boolean;
	status: ResourceStatus;
	controller?: AbortController;
}
/** Account transport and publication ownership; adapters retain their saved data and drafts. */
export class WorkspaceSavedState {
	private accountId: string | null = null;
	private activation: string | null = null;
	private terminal: string | null = null;
	private generation = 0;
	private epoch = 0;
	private source?: Source;
	private cleanup?: () => void;
	private resources = new Set<Resource>();
	private reset = false;
	private probe?: AbortController;
	private probeAgain = false;
	private status: WorkspaceStatus = 'idle';
	private environment: Environment;
	constructor(environment: Environment) {
		this.environment = environment;
	}
	getState() {
		return this.status;
	}
	isActive(accountId?: string) {
		return (
			!!this.accountId && (!accountId || this.accountId === accountId) && this.status !== 'expired'
		);
	}
	start({ accountId, activation }: { accountId: string | null; activation: string }) {
		if (
			this.terminal === activation ||
			(this.accountId === accountId && this.activation === activation)
		)
			return;
		this.stop();
		this.activation = activation;
		this.accountId = accountId;
		if (!accountId) return;
		const generation = this.generation;
		const current = () => generation === this.generation && this.accountId === accountId;
		this.cleanup = this.environment.listen(() => {
			if (current()) {
				this.invalidate();
				if (this.status === 'offline') this.probeSession();
			}
		});
		const source = this.environment.source();
		this.source = source;
		this.status = 'connecting';
		this.environment.changed();
		source.addEventListener('reset', () => {
			if (!current()) return;
			this.reset = true;
			this.status = source.readyState === 1 ? 'live' : 'connecting';
			this.invalidate();
		});
		source.addEventListener('recovering', () => {
			if (!current()) return;
			this.reset = false;
			this.epoch++;
			this.status = 'recovering';
			this.markStale();
		});
		source.addEventListener('invalidate', (event) => {
			if (!current()) return;
			try {
				const value = JSON.parse(event.data);
				if (
					!Array.isArray(value.topics) ||
					!value.topics.length ||
					value.topics.some(
						(topic: unknown) => !SAVED_STATE_TOPICS.includes(topic as SavedStateTopic)
					)
				)
					return;
				this.invalidate(value.topics);
			} catch {
				/* Ignore malformed signals. */
			}
		});
		source.addEventListener('auth-expired', () => {
			if (current()) this.expire();
		});
		source.onerror = () => {
			if (!current()) return;
			this.reset = false;
			this.epoch++;
			this.status = 'offline';
			this.markStale();
			this.probeSession();
		};
	}
	stop() {
		this.generation++;
		this.epoch++;
		this.reset = false;
		this.source?.close();
		this.source = undefined;
		this.cleanup?.();
		this.cleanup = undefined;
		this.probe?.abort();
		this.probe = undefined;
		this.probeAgain = false;
		this.accountId = null;
		this.activation = null;
		this.status = 'idle';
		for (const resource of this.resources) {
			resource.version++;
			resource.generation = this.generation;
			resource.writes = 0;
			resource.controller?.abort();
			resource.clear();
			resource.status.stale = true;
			resource.status.error = '';
		}
		this.environment.changed();
	}
	expire() {
		const activation = this.activation;
		this.stop();
		this.terminal = activation;
		this.status = 'expired';
		this.environment.changed();
	}
	private markStale() {
		for (const resource of this.resources) {
			resource.version++;
			resource.status.stale = true;
			resource.pending = true;
		}
		this.environment.changed();
	}
	invalidate(topics?: readonly SavedStateTopic[]) {
		for (const resource of this.resources) {
			if (topics && !resource.topics.some((topic) => topics.includes(topic))) continue;
			this.dirty(resource);
		}
		this.environment.changed();
	}
	private dirty(resource: Resource) {
		resource.version++;
		resource.pending = true;
		resource.status.stale = true;
		this.run(resource);
	}
	beginWrite(topics: readonly SavedStateTopic[]): WriteHandle {
		const generation = this.generation;
		const handles = [...this.resources]
			.filter((resource) => resource.topics.some((topic) => topics.includes(topic)))
			.map((resource) => this.resourceWrite(resource));
		let completed = false;
		return {
			current: () => generation === this.generation && this.isActive(),
			complete: () => {
				if (completed) return;
				completed = true;
				for (const handle of handles) handle.complete();
			}
		};
	}
	private resourceWrite(resource: Resource): WriteHandle {
		const generation = this.generation;
		resource.version++;
		resource.writes++;
		resource.status.stale = true;
		const current = () => !resource.disposed && generation === this.generation && this.isActive();
		let completed = false;
		this.environment.changed();
		return {
			current,
			complete: () => {
				if (completed) return;
				completed = true;
				if (!current()) return;
				resource.version++;
				resource.writes--;
				this.invalidate(resource.topics);
			}
		};
	}
	subscribe(input: {
		topics: readonly SavedStateTopic[];
		refresh(lease: ReadLease): Promise<void>;
		clear(): void;
	}): ResourceSubscription {
		const resource: Resource = {
			...input,
			version: 0,
			generation: this.generation,
			writes: 0,
			disposed: false,
			pending: false,
			status: { stale: true, refreshing: false, error: '' }
		};
		this.resources.add(resource);
		resource.pending = !!this.accountId;
		if (this.reset) this.run(resource);
		const dispose = () => {
			if (resource.disposed) return;
			resource.disposed = true;
			resource.version++;
			resource.controller?.abort();
			this.resources.delete(resource);
			resource.clear();
			this.environment.changed();
		};
		return {
			invalidate: () => {
				if (!resource.disposed) this.dirty(resource);
			},
			getState: () => ({ ...resource.status }),
			dispose,
			publication: () => {
				const generation = this.generation,
					epoch = this.epoch,
					version = resource.version;
				return () =>
					!resource.disposed &&
					generation === this.generation &&
					epoch === this.epoch &&
					version === resource.version &&
					!resource.writes &&
					!!this.accountId;
			},
			beginWrite: () => this.resourceWrite(resource)
		};
	}
	private run(resource: Resource) {
		if (
			resource.disposed ||
			resource.status.refreshing ||
			resource.writes ||
			!this.accountId ||
			!this.environment.visible() ||
			!resource.pending
		)
			return;
		resource.pending = false;
		resource.status.refreshing = true;
		const generation = this.generation,
			epoch = this.epoch,
			version = resource.version;
		const controller = new AbortController();
		resource.controller = controller;
		const current = () =>
			!controller.signal.aborted &&
			!resource.disposed &&
			generation === this.generation &&
			epoch === this.epoch &&
			version === resource.version &&
			!resource.writes &&
			!!this.accountId;
		this.environment.changed();
		void resource
			.refresh({ signal: controller.signal, current })
			.then(() => {
				if (current()) {
					resource.status.stale = !(this.reset && this.status === 'live');
					resource.status.error = '';
				}
			})
			.catch((cause) => {
				if (current()) {
					resource.status.stale = true;
					resource.status.error =
						cause instanceof Error
							? cause.message
							: 'Saved changes could not be loaded. Try again.';
				}
			})
			.finally(() => {
				resource.status.refreshing = false;
				if (resource.controller === controller) resource.controller = undefined;
				this.environment.changed();
				if (resource.pending) this.run(resource);
			});
	}
	private probeSession() {
		if (this.probe) {
			this.probeAgain = true;
			return;
		}
		if (!this.accountId) return;
		const generation = this.generation,
			controller = new AbortController();
		this.probe = controller;
		this.probeAgain = false;
		void this.environment
			.session(controller.signal)
			.then((status) => {
				if (generation === this.generation && status === 401) this.expire();
			})
			.catch(() => {})
			.finally(() => {
				if (this.probe !== controller) return;
				this.probe = undefined;
				if (this.probeAgain) {
					this.probeAgain = false;
					this.probeSession();
				}
			});
	}
}
