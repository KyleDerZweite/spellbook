import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type PropsWithChildren
} from 'react';
import { AppState, useColorScheme } from 'react-native';
import { createApi, HttpError, InvalidResponse, type Api, type Schema } from './api';
import { createReadCache } from './cache';
import { InventoryWrites } from './inventory-writes';
import { messages, type Message, type Translate } from './i18n';
import { defaults, loadPreferences, savePreferences, type Preferences } from './settings';

const sessionKey = 'spellbook.session';
const secureOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

type StoredSession = { origin: string; token: string; id: string; info: Schema<'SessionInfo'> };
type Session = StoredSession & {
	controller: AbortController;
	cache: ReturnType<typeof createReadCache>;
};

const dark = {
	background: '#111525',
	surface: '#1c2236',
	elevated: '#272e45',
	border: '#363e58',
	text: '#f6f5fc',
	muted: '#b1b8d2',
	accent: '#c4b5fd',
	onAccent: '#241643',
	danger: '#fda4af'
};
const light = {
	background: '#f6f5fb',
	surface: '#ffffff',
	elevated: '#ece9f8',
	border: '#ddd7ec',
	text: '#1e1a30',
	muted: '#5f5875',
	accent: '#5b35ae',
	onAccent: '#ffffff',
	danger: '#aa1b40'
};

function openSession(saved: StoredSession): Session {
	return { ...saved, controller: new AbortController(), cache: createReadCache(saved.id) };
}

function persistSession({ origin, token, id, info }: StoredSession) {
	return SecureStore.setItemAsync(
		sessionKey,
		JSON.stringify({ origin, token, id, info }),
		secureOptions
	);
}

type AppContext = {
	ready: boolean;
	preferences: Preferences;
	session: Schema<'SessionInfo'> | undefined;
	sessionScope?: string;
	suspended: boolean;
	checkingSession: boolean;
	checkSession: () => Promise<void>;
	cache: Session['cache'] | undefined;
	api: Api;
	guestApi: Api;
	t: Translate;
	colors: typeof light;
	isDark: boolean;
	notice?: Message;
	activate: (token: string, signal: AbortSignal) => Promise<void>;
	signOut: () => Promise<void>;
	updatePreferences: (changes: Partial<Preferences>) => Promise<void>;
};

const Context = createContext<AppContext | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
	const [preferences, setPreferences] = useState(defaults);
	const [session, setSession] = useState<Session>();
	const [suspendedId, setSuspendedId] = useState<string>();
	const verifying = useRef<string | undefined>(undefined);
	const [checkingId, setCheckingId] = useState<string>();
	const [notice, setNotice] = useState<Message>();
	const [ready, setReady] = useState(false);
	const active = useRef<Session | undefined>(undefined);
	const secureWrites = useRef<Promise<void>>(Promise.resolve());
	const preferencesRef = useRef(defaults);
	const preferenceWrites = useRef<Promise<void>>(Promise.resolve());

	const writeSecure = useCallback((write: () => Promise<void>) => {
		const next = secureWrites.current.then(write);
		secureWrites.current = next.catch(() => {});
		return next;
	}, []);

	useEffect(() => {
		let live = true;
		void Promise.all([
			loadPreferences().catch(() => defaults),
			SecureStore.getItemAsync(sessionKey, secureOptions).catch(() => null)
		]).then(async ([settings, raw]) => {
			if (!live) return;
			preferencesRef.current = settings;
			setPreferences(settings);
			try {
				if (raw) {
					const saved: StoredSession = JSON.parse(raw);
					const expiresAt = Date.parse(saved.info.expiresAt);
					if (
						saved.origin === settings.origin &&
						settings.origin &&
						saved.token &&
						saved.id &&
						Number.isFinite(expiresAt) &&
						(saved.info.device || expiresAt > Date.now())
					) {
						active.current = openSession(saved);
						if (expiresAt <= Date.now()) setSuspendedId(saved.id);
						setSession(active.current);
					} else {
						if (saved.id) await createReadCache(saved.id).close();
						await writeSecure(() => SecureStore.deleteItemAsync(sessionKey, secureOptions));
					}
				}
			} catch {
				setNotice('error');
			} finally {
				if (live) setReady(true);
			}
		});
		return () => {
			live = false;
		};
	}, [writeSecure]);

	const clear = useCallback(
		async (current: Session, reason?: Message) => {
			if (active.current?.id !== current.id) return;
			active.current = undefined;
			current.controller.abort();
			setSession(undefined);
			setSuspendedId(undefined);
			setNotice(reason);
			await Promise.all([
				current.cache.close(),
				writeSecure(() => SecureStore.deleteItemAsync(sessionKey, secureOptions))
			]);
		},
		[writeSecure]
	);

	const guestApi = useMemo(() => createApi(preferences.origin), [preferences.origin]);
	const sessionApi = useMemo(() => {
		if (!session) return undefined;
		return createApi(
			session.origin,
			session.token,
			() => {
				void clear(session, 'sessionEnded').catch(() => setNotice('error'));
			},
			session.controller.signal
		);
	}, [clear, session?.id]);

	const checkSession = useCallback(async () => {
		const sessionId = session?.id;
		const current = active.current;
		if (!sessionApi || !current || current.id !== sessionId) return;
		if (Date.parse(current.info.expiresAt) <= Date.now()) {
			if (!current.info.device) {
				await clear(current, 'sessionEnded').catch(() => setNotice('error'));
				return;
			}
			setSuspendedId(current.id);
		}
		if (verifying.current === current.id) return;
		verifying.current = current.id;
		setCheckingId(current.id);
		try {
			const info = await sessionApi('get', '/api/v1/auth/session', {});
			if (active.current?.id !== current.id) return;
			if (info.user.accountId !== current.info.user.accountId) {
				await clear(current, 'sessionEnded');
				return;
			}
			if (!(Date.parse(info.expiresAt) > Date.now())) return;
			const next = { ...current, info };
			active.current = next;
			setSession(next);
			setSuspendedId(undefined);
			await writeSecure(() => persistSession(next));
		} catch {
			// A 401 clears authority. An expired linked-device session stays hidden until verified.
		} finally {
			if (verifying.current === current.id) {
				verifying.current = undefined;
				setCheckingId(undefined);
			}
		}
	}, [clear, session?.id, sessionApi, writeSecure]);

	useEffect(() => {
		if (!session) return;
		void checkSession();
		const foreground = AppState.addEventListener('change', (state) => {
			if (state === 'active') void checkSession();
		});
		return () => foreground.remove();
	}, [checkSession, session?.id]);

	useEffect(() => {
		if (!session || suspendedId === session.id) return;
		const expiresAt = Date.parse(session.info.expiresAt);
		let timer: ReturnType<typeof setTimeout>;
		const schedule = () => {
			const remaining = expiresAt - Date.now();
			if (remaining <= 0) void checkSession();
			else timer = setTimeout(schedule, Math.min(remaining, 2_147_483_647));
		};
		schedule();
		return () => clearTimeout(timer);
	}, [checkSession, session, suspendedId]);

	const activate = async (token: string, signal: AbortSignal) => {
		const { origin } = preferences;
		const candidate = createApi(origin, token);
		const stillCurrent = () =>
			!signal.aborted && !active.current && origin === preferencesRef.current.origin;
		try {
			if (!stillCurrent()) throw new InvalidResponse();
			const info = await candidate('get', '/api/v1/auth/session', { signal });
			await writeSecure(async () => {
				if (!stillCurrent() || !(Date.parse(info.expiresAt) > Date.now()))
					throw new InvalidResponse();
				const saved = { origin, token, id: randomUUID(), info };
				await persistSession(saved);
				if (!stillCurrent()) {
					await SecureStore.deleteItemAsync(sessionKey, secureOptions);
					throw new InvalidResponse();
				}
				active.current = openSession(saved);
				setSession(active.current);
				setNotice(undefined);
			});
		} catch (error) {
			void candidate('post', '/api/v1/auth/logout', {}).catch(() => {});
			throw error;
		}
	};

	const signOut = async () => {
		const current = active.current;
		if (!current) return;
		try {
			await Promise.all([
				clear(current),
				createApi(current.origin, current.token)('post', '/api/v1/auth/logout', {})
			]);
		} catch (error) {
			if (!active.current && (!(error instanceof HttpError) || error.status !== 401)) {
				setNotice('localSignOut');
			}
		}
	};

	const updatePreferences = (changes: Partial<Preferences>) => {
		const next = preferenceWrites.current.then(async () => {
			if (active.current && changes.origin !== undefined) return;
			const updated = { ...preferencesRef.current, ...changes };
			await savePreferences(updated);
			preferencesRef.current = updated;
			setPreferences(updated);
		});
		preferenceWrites.current = next.catch(() => {});
		return next;
	};

	const system = useColorScheme();
	const isDark =
		preferences.theme === 'dark' || (preferences.theme === 'system' && system === 'dark');
	const t = useCallback(
		(message: Message) => messages[preferences.language][message],
		[preferences.language]
	);

	const suspended = !!session && suspendedId === session.id;
	const visibleSession = suspended ? undefined : session;
	return (
		<Context.Provider
			value={{
				ready,
				preferences,
				session: visibleSession?.info,
				sessionScope: session?.id,
				suspended,
				checkingSession: !!session && checkingId === session.id,
				checkSession,
				cache: visibleSession?.cache,
				api: (visibleSession && sessionApi) || guestApi,
				guestApi,
				t,
				colors: isDark ? dark : light,
				isDark,
				notice,
				activate,
				signOut,
				updatePreferences
			}}
		>
			<InventoryWrites scope={session?.id} api={visibleSession && sessionApi}>
				{children}
			</InventoryWrites>
		</Context.Provider>
	);
}

export function useApp() {
	const app = useContext(Context);
	if (!app) throw new Error('AppProvider is required');
	return app;
}
