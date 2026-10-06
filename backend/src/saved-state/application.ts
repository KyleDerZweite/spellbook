import pg from 'pg';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import {
	SAVED_STATE_TOPICS,
	type SavedStateEvent,
	type SavedStateApplication,
	type SavedStateSubscription,
	type SavedStateTopic
} from '@spellbook/contracts/saved-state.ts';
import { ActorError } from '../auth/local.ts';
import type { createLocalAuth } from '../auth/local.ts';

export const SAVED_STATE_CHANNEL = 'spellbook_saved_state';
export const SAVED_STATE_REVALIDATE_MS = 10000;
export const SAVED_STATE_SLOW_MS = 30000;
type SavedStateRuntime = SavedStateApplication & {
	diagnostics(): { subscribers: number; ready: boolean; queuedEvents: number };
};
type Auth = Pick<ReturnType<typeof createLocalAuth>, 'actorSession'>;

/** One listener per application process; subscriptions retain only coalesced topics. */
export function createSavedState(databaseUrl: string, auth: Auth): SavedStateRuntime {
	const subscribers = new Set<Subscription>();
	let listener: pg.Client | undefined;
	let connecting: Promise<void> | undefined;
	let retry: ReturnType<typeof setTimeout> | undefined;
	let ready = false;
	let closed = false;
	let epoch = 0;
	const pendingTopics = new Map<string, Set<string>>();
	let draining = false;

	class Subscription {
		accountId: string;
		private actor: AuthUser;
		private expiry: ReturnType<typeof setTimeout>;
		private periodic: ReturnType<typeof setInterval>;
		private slow: ReturnType<typeof setTimeout> | undefined;
		private queue: SavedStateEvent[] = [];
		get queuedEvents() {
			return this.queue.length;
		}
		private waiting: ((event: SavedStateEvent | null) => void) | undefined;
		private stopped = false;
		constructor(actor: AuthUser, accountId: string, expiresAt: string) {
			this.actor = actor;
			this.accountId = accountId;
			this.expiry = this.scheduleExpiry(Date.parse(expiresAt));
			this.periodic = setInterval(() => {
				void this.validate().catch(() => lost());
			}, SAVED_STATE_REVALIDATE_MS);
		}
		private scheduleExpiry(expiresAt: number): ReturnType<typeof setTimeout> {
			return setTimeout(
				() => {
					if (Date.now() < expiresAt) this.expiry = this.scheduleExpiry(expiresAt);
					else this.expire();
				},
				Math.max(0, Math.min(2147483647, expiresAt - Date.now()))
			);
		}

		async validate() {
			if (this.stopped) return false;
			try {
				const session = await auth.actorSession(this.actor);
				if (this.stopped) return false;
				if (session.user.accountId !== this.accountId) {
					this.expire();
					return false;
				}
				clearTimeout(this.expiry);
				this.expiry = this.scheduleExpiry(Date.parse(session.expiresAt));
				return true;
			} catch (cause) {
				if (
					cause &&
					typeof cause === 'object' &&
					'kind' in cause &&
					cause.kind === 'Unauthenticated'
				) {
					this.expire();
					return false;
				}
				throw cause;
			}
		}
		offer(event: SavedStateEvent) {
			if (this.stopped) return;
			if (event.event === 'reset' || event.event === 'recovering') this.queue = [];
			if (event.event === 'invalidate') {
				const previous = this.queue.find((item) => item.event === 'invalidate');
				if (previous?.event === 'invalidate') {
					previous.data.topics = [...new Set([...previous.data.topics, ...event.data.topics])];
					return;
				}
			}
			this.queue.push(event);
			if (!this.slow) this.slow = setTimeout(() => this.close(), SAVED_STATE_SLOW_MS);
			this.wake();
		}
		private wake() {
			const resolve = this.waiting;
			if (resolve) {
				this.waiting = undefined;
				resolve(this.queue.shift() ?? null);
				if (!this.queue.length) {
					clearTimeout(this.slow);
					this.slow = undefined;
				}
			}
		}
		async next(): Promise<SavedStateEvent | null> {
			for (;;) {
				const event =
					this.queue.shift() ??
					(await new Promise<SavedStateEvent | null>((resolve) => {
						if (this.stopped) resolve(null);
						else this.waiting = resolve;
					}));
				if (!this.queue.length) {
					clearTimeout(this.slow);
					this.slow = undefined;
				}
				if (!event || event.event === 'auth-expired' || event.event === 'recovering') return event;
				const deliveryEpoch = epoch;
				try {
					if (!(await this.validate())) return this.queue.shift() ?? null;
				} catch {
					lost();
					continue;
				}
				if (ready && deliveryEpoch === epoch && !this.stopped) return event;
			}
		}
		expire() {
			if (this.stopped) return;
			this.queue = [];
			this.queue.push({ event: 'auth-expired', data: {} });
			this.dispose();
			this.wake();
		}
		private dispose() {
			this.stopped = true;
			subscribers.delete(this);
			clearTimeout(this.expiry);
			clearInterval(this.periodic);
			clearTimeout(this.slow);
		}
		close() {
			this.queue = [];
			this.dispose();
			this.wake();
		}
	}
	function schedule() {
		if (!closed && !retry)
			retry = setTimeout(() => {
				retry = undefined;
				void connect().catch(() => schedule());
			}, 500);
	}
	function lost() {
		if (closed) return;
		ready = false;
		epoch++;
		pendingTopics.clear();
		const previous = listener;
		listener = undefined;
		if (previous) void previous.end().catch(() => {});
		for (const sub of subscribers) sub.offer({ event: 'recovering', data: {} });
		schedule();
	}
	function enqueue(accountId: string, topic: string) {
		if (![...subscribers].some((sub) => sub.accountId === accountId)) return;
		const topics = pendingTopics.get(accountId) ?? new Set<string>();
		topics.add(topic);
		pendingTopics.set(accountId, topics);
		if (draining) return;
		draining = true;
		void (async () => {
			try {
				while (ready && pendingTopics.size) {
					const [accountId, topics] = pendingTopics.entries().next().value!;
					pendingTopics.delete(accountId);
					for (const topic of topics) await fanout(accountId, topic);
				}
			} finally {
				draining = false;
			}
		})();
	}

	async function fanout(accountId: string, topic: string) {
		if (!ready) return;
		const deliveryEpoch = epoch;
		const targets = [...subscribers].filter((sub) => sub.accountId === accountId);
		for (const sub of targets) {
			try {
				if ((await sub.validate()) && ready && epoch === deliveryEpoch && topic !== 'auth')
					sub.offer({
						event: 'invalidate',
						data: { topics: [topic as SavedStateTopic] }
					});
			} catch {
				lost();
				return;
			}
		}
	}
	async function connect() {
		if (closed || ready) return;
		if (connecting) return connecting;
		connecting = (async () => {
			const client = new pg.Client({
				connectionString: databaseUrl,
				application_name: `spellbook_saved_state:${process.pid}`
			});
			listener = client;
			const failed = () => {
				if (listener === client) lost();
			};
			client.on('error', failed);
			client.on('end', failed);
			client.on('notification', (message) => {
				if (!ready || message.channel !== SAVED_STATE_CHANNEL || !message.payload) return;
				try {
					const value = JSON.parse(message.payload);
					if (
						typeof value.accountId === 'string' &&
						(value.topic === 'auth' || SAVED_STATE_TOPICS.includes(value.topic))
					)
						enqueue(value.accountId, value.topic);
				} catch {
					/* Malformed external notifications confer no authority. */
				}
			});
			try {
				await client.connect();
				await client.query(`LISTEN ${SAVED_STATE_CHANNEL}`);
				// Recovery barrier includes every attached session, including subscriptions added while validating.
				const checked = new Set<Subscription>();
				for (;;) {
					const remaining = [...subscribers].filter((sub) => !checked.has(sub));
					if (!remaining.length) break;
					await Promise.all(
						remaining.map(async (sub) => {
							await sub.validate();
							checked.add(sub);
						})
					);
				}
				if (listener !== client || closed) return;
				ready = true;
				for (const sub of subscribers) sub.offer({ event: 'reset', data: {} });
			} catch (cause) {
				if (listener === client) lost();
				throw cause;
			}
		})();
		try {
			await connecting;
		} finally {
			connecting = undefined;
			if (!ready) schedule();
		}
	}
	return {
		async subscribe(actor: AuthUser): Promise<SavedStateSubscription> {
			const session = await auth.actorSession(actor);
			const sub = new Subscription(actor, session.user.accountId, session.expiresAt);
			subscribers.add(sub);
			try {
				await connect();
				if (!ready) throw Error('Saved state temporarily unavailable');
				if (!(await sub.validate())) throw new ActorError();
				sub.offer({ event: 'reset', data: {} });
				return sub;
			} catch (cause) {
				sub.close();
				throw cause;
			}
		},
		async close() {
			closed = true;
			ready = false;
			pendingTopics.clear();
			clearTimeout(retry);
			for (const sub of [...subscribers]) sub.close();
			const previous = listener;
			listener = undefined;
			await previous?.end();
		},
		diagnostics() {
			return {
				subscribers: subscribers.size,
				ready,
				queuedEvents: [...subscribers].reduce((count, sub) => count + sub.queuedEvents, 0)
			};
		}
	} satisfies SavedStateRuntime;
}
