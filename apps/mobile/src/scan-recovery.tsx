import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPendingResultAsync, type ImagePickerAsset } from 'expo-image-picker';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import {
	createContext,
	useContext,
	useEffect,
	useRef,
	useState,
	type PropsWithChildren
} from 'react';
import { AppState, Platform } from 'react-native';
import { useApp } from './session';

const pendingKey = 'spellbook.scan.picker';

// Expo exposes one native result slot shared by every account in this process.
let pendingWork = Promise.resolve();
let pickerOpen = false;

function withPendingResult<T>(action: () => Promise<T>): Promise<T> {
	const next = pendingWork.then(action);
	pendingWork = next.then(
		() => {},
		() => {}
	);
	return next;
}

const Context = createContext<{
	photo?: ImagePickerAsset;
	forgetPhoto: () => void;
	pick: <T>(launch: () => Promise<T>) => Promise<T>;
} | null>(null);

export function ScanRecovery({ children }: PropsWithChildren) {
	const { session, sessionScope } = useApp();
	const router = useRouter();
	const navigationKey = useRootNavigationState()?.key;
	const pathname = usePathname();
	const route = useRef(pathname);
	route.current = pathname;
	const [recovered, setRecovered] = useState<{ scope: string; photo: ImagePickerAsset }>();
	const scope = session ? sessionScope : undefined;
	const activeScope = useRef(scope);
	activeScope.current = scope;

	useEffect(() => {
		if (Platform.OS !== 'android' || !navigationKey || !scope) return;
		let live = true;
		let checking = false;
		const restore = async () => {
			if (checking) return;
			checking = true;
			try {
				const photo = await withPendingResult(async () => {
					if (!live || pickerOpen || (await AsyncStorage.getItem(pendingKey)) !== scope) return;
					if (!live || activeScope.current !== scope) return;
					const result = await getPendingResultAsync();
					if (!result) return;
					await AsyncStorage.removeItem(pendingKey);
					if ('assets' in result && !result.canceled) return result.assets[0];
				});
				if (!live || activeScope.current !== scope || !photo) return;
				setRecovered({ scope, photo });
				if (route.current !== '/scan') router.navigate('/scan');
			} catch {
				// Recovery is optional when Android cannot return the previous picker result.
			} finally {
				checking = false;
			}
		};
		void restore();
		const foreground = AppState.addEventListener('change', (state) => {
			if (state === 'active') void restore();
		});
		return () => {
			live = false;
			foreground.remove();
		};
	}, [navigationKey, router, scope]);

	return (
		<Context.Provider
			value={{
				photo: recovered?.scope === scope && scope ? recovered?.photo : undefined,
				forgetPhoto: () => setRecovered(undefined),
				pick: async (launch) => {
					if (!scope || activeScope.current !== scope) throw new Error('Scan session ended');
					if (Platform.OS !== 'android') return launch();

					await withPendingResult(async () => {
						if (pickerOpen || activeScope.current !== scope)
							throw new Error('Scan picker unavailable');
						// Never attach an earlier native result to the next picker owner's marker.
						await getPendingResultAsync();
						if (activeScope.current !== scope) throw new Error('Scan session ended');
						await AsyncStorage.setItem(pendingKey, scope);
						pickerOpen = true;
					});
					try {
						if (activeScope.current !== scope) throw new Error('Scan session ended');
						return await launch();
					} finally {
						await withPendingResult(async () => {
							try {
								await AsyncStorage.removeItem(pendingKey);
							} finally {
								pickerOpen = false;
							}
						}).catch(() => {});
					}
				}
			}}
		>
			{children}
		</Context.Provider>
	);
}

export function useScanRecovery() {
	const recovery = useContext(Context);
	if (!recovery) throw new Error('ScanRecovery provider is required');
	return recovery;
}
