/** Coarse invalidations carry no persisted documents, account IDs or credentials. */
export const SAVED_STATE_TOPICS = ['profile', 'inventory', 'decks', 'scan'] as const;
export type SavedStateTopic = (typeof SAVED_STATE_TOPICS)[number];
export type SavedStateEvent =
	| {
			event: 'reset' | 'recovering' | 'auth-expired';
			data: Record<string, never>;
	  }
	| { event: 'invalidate'; data: { topics: SavedStateTopic[] } };
export const SAVED_STATE_HEARTBEAT_MS = 15000;
export const SAVED_STATE_PATH = '/api/account/events';

export interface SavedStateSubscription {
	next(): Promise<SavedStateEvent | null>;
	/** Revalidate immediately before writing a reserved event to the transport. */
	deliver(event: SavedStateEvent): Promise<SavedStateEvent | null>;
	close(): void;
}
/** Transport cancellation without a framework or platform dependency. */
export interface SavedStateCancellation {
	readonly aborted: boolean;
	onAbort(listener: () => void): () => void;
}
export interface SavedStateApplication {
	subscribe(
		actor: import('./auth.ts').AuthUser,
		cancellation?: SavedStateCancellation
	): Promise<SavedStateSubscription>;
	close(): Promise<void>;
}
