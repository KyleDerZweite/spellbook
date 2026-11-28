import { useIsFocused } from 'expo-router/react-navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { NetworkError } from './api';
import type { ReadCache } from './cache';

type State<T> =
	| { status: 'loading' }
	| { status: 'ready'; data: T; offline: boolean }
	| { status: 'error'; error: unknown };

export function useResource<T>(
	load: (signal: AbortSignal) => Promise<T>,
	{
		enabled = true,
		cache,
		cacheKey,
		revision
	}: { enabled?: boolean; cache?: ReadCache; cacheKey?: string; revision?: number } = {}
) {
	const focused = useIsFocused();
	const [version, setVersion] = useState(0);
	const [result, setResult] = useState<{
		load: typeof load;
		version: number;
		revision?: number;
		state: State<T>;
	}>();
	const refresh = useCallback(() => setVersion((value) => value + 1), []);
	useEffect(() => {
		if (!focused || !enabled) return;
		const listener = AppState.addEventListener('change', (state) => {
			if (state === 'active') refresh();
		});
		return () => listener.remove();
	}, [enabled, focused, refresh]);
	useEffect(() => {
		if (!enabled || !focused) return;
		const controller = new AbortController();
		const { signal } = controller;
		const publish = (state: State<T>) => {
			if (!signal.aborted) setResult({ load, version, revision, state });
		};
		publish({ status: 'loading' });
		void load(signal)
			.then((data) => {
				if (signal.aborted) return;
				if (cache && cacheKey) cache.put(cacheKey, data);
				publish({ status: 'ready', data, offline: false });
			})
			.catch(async (error: unknown) => {
				const data =
					error instanceof NetworkError && cache && cacheKey
						? await cache.get<T>(cacheKey)
						: undefined;
				publish(
					data === undefined ? { status: 'error', error } : { status: 'ready', data, offline: true }
				);
			});
		return () => controller.abort();
	}, [cache, cacheKey, enabled, focused, load, revision, version]);

	const state: State<T> =
		enabled && result?.load === load && result.version === version && result.revision === revision
			? result.state
			: { status: 'loading' };
	return { state, refresh };
}

export function useDebounced(value: string, delay = 250) {
	const [settled, setSettled] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setSettled(value), delay);
		return () => clearTimeout(timer);
	}, [delay, value]);
	return settled;
}
