import { DemoSessionChanged } from './conflict.ts';

// Keep personal account data and the card image cache out of this database.
function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('spellbook-demo', 1);
		request.onupgradeneeded = () => request.result.createObjectStore('sessions');
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function transaction<T>(
	mode: IDBTransactionMode,
	run: (
		store: IDBObjectStore,
		complete: (result: T) => void,
		abort: (cause: unknown) => void
	) => void
): Promise<T> {
	const db = await open();
	try {
		return await new Promise((resolve, reject) => {
			const tx = db.transaction('sessions', mode);
			let result: T;
			tx.oncomplete = () => resolve(result);
			tx.onabort = () => reject(tx.error ?? new Error('Demo storage aborted'));
			run(
				tx.objectStore('sessions'),
				(value) => {
					result = value;
				},
				(cause) => {
					reject(cause);
					tx.abort();
				}
			);
		});
	} finally {
		db.close();
	}
}

export function readDemo<T>(session: string, section: string): Promise<T | undefined> {
	return transaction('readonly', (store, complete) => {
		const request = store.get([session, section]);
		request.onsuccess = () => complete(request.result);
	});
}

export function demoGeneration(session: string): Promise<string | undefined> {
	return readDemo<string>(session, '');
}

export function clearDemo(session: string, logout = false): Promise<void> {
	return transaction('readwrite', (store) => {
		const key = [session, ''];
		const current = store.get(key);
		current.onsuccess = () => {
			store.delete(IDBKeyRange.bound([session], [session, []]));
			store.put(
				logout || current.result === 'logged-out' ? 'logged-out' : crypto.randomUUID(),
				key
			);
		};
	});
}

export async function updateDemo<T>(
	session: string,
	section: string,
	seed: T,
	update: (current: T) => T,
	expected: { generation: string | undefined }
): Promise<void> {
	return transaction('readwrite', (store, _, abort) => {
		const generation = store.get([session, '']);
		generation.onsuccess = () => {
			if (generation.result === 'logged-out' || expected.generation !== generation.result) {
				abort(new DemoSessionChanged());
				return;
			}
			const key = [session, section];
			const request = store.get(key);
			request.onsuccess = () => {
				try {
					store.put(update(request.result ?? seed), key);
				} catch (cause) {
					abort(cause);
				}
			};
		};
	});
}
