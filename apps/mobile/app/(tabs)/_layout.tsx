import { Tabs } from 'expo-router';
import { Layers3, Library, Search, Settings2 } from 'lucide-react-native';
import { useApp } from '../../src/session';

export default function TabsLayout() {
	const { t, colors } = useApp();
	return (
		<Tabs
			screenOptions={{
				headerShown: false,
				tabBarActiveTintColor: colors.accent,
				tabBarInactiveTintColor: colors.muted,
				tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border }
			}}
		>
			<Tabs.Screen
				name="index"
				options={{ title: t('search'), tabBarIcon: (props) => <Search {...props} /> }}
			/>
			<Tabs.Screen
				name="inventory"
				options={{ title: t('inventory'), tabBarIcon: (props) => <Library {...props} /> }}
			/>
			<Tabs.Screen
				name="decks"
				options={{ title: t('decks'), tabBarIcon: (props) => <Layers3 {...props} /> }}
			/>
			<Tabs.Screen
				name="more"
				options={{ title: t('more'), tabBarIcon: (props) => <Settings2 {...props} /> }}
			/>
		</Tabs>
	);
}
