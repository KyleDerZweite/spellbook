import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_PAGES = 12;
const MAX_CHARACTERS = 250_000;

export function createReadCache(id: string) {
	const key = `spellbook.reads.${id}`;
	let closed = false;
	const pages = AsyncStorage.getItem(key)
		.then((raw) => {
			if (!raw) return new Map<string, unknown>();
			return new Map<string, unknown>(JSON.parse(raw));
		})
		.catch(() => new Map<string, unknown>());
	let writes: Promise<void> = Promise.resolve();

	return {
		async get<T>(query: string): Promise<T | undefined> {
			const index = await pages;
			return closed ? undefined : (index.get(query) as T | undefined);
		},
		put(query: string, value: unknown) {
			writes = writes
				.then(async () => {
					const index = await pages;
					if (closed || JSON.stringify(value).length > MAX_CHARACTERS) return;
					index.delete(query);
					index.set(query, value);
					let encoded = JSON.stringify([...index]);
					while (index.size > MAX_PAGES || encoded.length > MAX_CHARACTERS) {
						const oldest = index.keys().next().value;
						if (oldest === undefined) break;
						index.delete(oldest);
						encoded = JSON.stringify([...index]);
					}
					await AsyncStorage.setItem(key, encoded);
				})
				.catch(() => {});
		},
		close() {
			closed = true;
			writes = writes.then(() => AsyncStorage.removeItem(key)).catch(() => {});
			return writes;
		}
	};
}

export type ReadCache = ReturnType<typeof createReadCache>;
