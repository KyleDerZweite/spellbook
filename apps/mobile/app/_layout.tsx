import { Stack, useRouter } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { ScanRecovery } from '../src/scan-recovery';
import { AppProvider, useApp } from '../src/session';
import { Button, Loading, Screen } from '../src/ui';

function Navigation() {
	const { ready, session, suspended, preferences, colors, t, isDark } = useApp();
	const navigationTheme = isDark ? DarkTheme : DefaultTheme;
	const router = useRouter();
	const closeModal = () => {
		if (router.canGoBack()) router.back();
		else router.replace('/');
	};
	const modalOptions = {
		presentation: 'modal' as const,
		headerBackVisible: false,
		headerRight: () => <Button label={t('close')} onPress={closeModal} compact />
	};
	if (!ready)
		return (
			<Screen inset>
				<Loading />
			</Screen>
		);
	return (
		<ThemeProvider
			value={{
				...navigationTheme,
				colors: {
					...navigationTheme.colors,
					background: colors.background,
					card: colors.surface,
					border: colors.border,
					primary: colors.accent,
					text: colors.text
				}
			}}
		>
			<StatusBar style={isDark ? 'light' : 'dark'} />
			<ScanRecovery>
				<Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
					<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
					<Stack.Screen name="printing/[id]" options={{ ...modalOptions, title: t('printing') }} />
					<Stack.Protected guard={!session && !suspended && !!preferences.origin}>
						<Stack.Screen name="sign-in" options={{ ...modalOptions, title: t('signIn') }} />
					</Stack.Protected>
					<Stack.Protected guard={!!session}>
						<Stack.Screen name="deck/[id]" options={{ title: t('decks') }} />
						<Stack.Screen name="scan" options={{ title: t('scan') }} />
					</Stack.Protected>
				</Stack>
			</ScanRecovery>
		</ThemeProvider>
	);
}

export default function RootLayout() {
	return (
		<AppProvider>
			<Navigation />
		</AppProvider>
	);
}
