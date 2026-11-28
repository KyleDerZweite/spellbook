import { useRouter } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';
import {
	ActivityIndicator,
	Image,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
	type TextInputProps,
	type ViewStyle
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorMessage } from './i18n';
import { useInventoryWrites } from './inventory-writes';
import { useApp } from './session';

export function Copy({
	children,
	kind = 'body'
}: PropsWithChildren<{
	kind?: 'title' | 'heading' | 'body' | 'muted' | 'danger' | 'accent';
}>) {
	const { colors } = useApp();
	const color =
		kind === 'muted' || kind === 'danger' || kind === 'accent' ? colors[kind] : colors.text;
	return <Text style={[styles[kind], { color }]}>{children}</Text>;
}

export function Button({
	label,
	onPress,
	disabled,
	tone = 'secondary',
	icon,
	selected,
	compact
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	tone?: 'primary' | 'secondary' | 'danger';
	icon?: ReactNode;
	selected?: boolean;
	compact?: boolean;
}) {
	const { colors } = useApp();
	const color =
		tone === 'primary' ? colors.onAccent : tone === 'danger' ? colors.danger : colors.text;
	const backgroundColor = tone === 'primary' ? colors.accent : colors.elevated;
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled, selected }}
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => [
				styles.button,
				{
					backgroundColor,
					borderColor: selected ? colors.accent : 'transparent',
					opacity: disabled ? 0.45 : pressed ? 0.72 : 1
				},
				compact && { paddingHorizontal: 10 }
			]}
		>
			{icon ?? <Text style={[styles.buttonLabel, { color }]}>{label}</Text>}
		</Pressable>
	);
}

export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
	const { colors } = useApp();
	return (
		<TextInput
			accessibilityLabel={label}
			placeholder={label}
			placeholderTextColor={colors.muted}
			style={[
				styles.input,
				{ backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
				style
			]}
			{...props}
		/>
	);
}

export function Screen({
	children,
	inset = false,
	scroll = false
}: PropsWithChildren<{
	inset?: boolean;
	scroll?: boolean;
}>) {
	const { colors } = useApp();
	const inside = scroll ? (
		<ScrollView
			automaticallyAdjustKeyboardInsets
			keyboardShouldPersistTaps="handled"
			contentContainerStyle={styles.content}
		>
			{children}
		</ScrollView>
	) : (
		<View style={[styles.content, styles.fill]}>{children}</View>
	);
	return (
		<SafeAreaView
			edges={inset ? ['top', 'left', 'right'] : ['bottom', 'left', 'right']}
			style={[styles.fill, { backgroundColor: colors.background }]}
		>
			{inside}
		</SafeAreaView>
	);
}

export function Panel({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
	const { colors } = useApp();
	return (
		<View
			style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }, style]}
		>
			{children}
		</View>
	);
}

export function Row({ children }: PropsWithChildren) {
	return <View style={styles.row}>{children}</View>;
}

export function Item({
	title,
	subtitle,
	image,
	right,
	onPress
}: {
	title: string;
	subtitle?: string;
	image?: string;
	right?: ReactNode;
	onPress?: () => void;
}) {
	const { colors } = useApp();
	const body = (
		<>
			{image ? (
				<Image
					source={{ uri: image }}
					style={[styles.thumbnail, { backgroundColor: colors.elevated }]}
				/>
			) : null}
			<View style={styles.itemText}>
				<Copy kind="heading">{title}</Copy>
				{subtitle ? <Copy kind="muted">{subtitle}</Copy> : null}
			</View>
			{right}
		</>
	);
	return (
		<View
			style={[styles.itemFrame, { backgroundColor: colors.surface, borderColor: colors.border }]}
		>
			{onPress ? (
				<Pressable
					style={styles.item}
					accessibilityRole="button"
					accessibilityLabel={title}
					onPress={onPress}
				>
					{body}
				</Pressable>
			) : (
				<View style={styles.item}>{body}</View>
			)}
		</View>
	);
}

export function Loading() {
	const { colors, t } = useApp();
	return (
		<ActivityIndicator
			accessibilityLabel={t('loading')}
			color={colors.accent}
			style={styles.loading}
		/>
	);
}

export function Problem({ error, retry }: { error: unknown; retry: () => void }) {
	const { t } = useApp();
	return (
		<Panel>
			<Copy kind="danger">{errorMessage(t, error)}</Copy>
			<Button label={t('retry')} onPress={retry} />
		</Panel>
	);
}

export function Gate() {
	const { preferences, t, suspended, checkingSession, checkSession } = useApp();
	const router = useRouter();
	if (suspended)
		return (
			<Panel>
				<Copy>{t('sessionNeedsCheck')}</Copy>
				<Button
					label={t(checkingSession ? 'loading' : 'retry')}
					disabled={checkingSession}
					onPress={() => void checkSession()}
				/>
			</Panel>
		);

	return (
		<Panel>
			<Copy>{t(preferences.origin ? 'signInRequired' : 'configure')}</Copy>
			<Button
				tone="primary"
				label={t(preferences.origin ? 'signIn' : 'settings')}
				onPress={() => {
					router.push(preferences.origin ? '/sign-in' : '/more');
				}}
			/>
		</Panel>
	);
}

export function InventoryWriteStatus({ offline = false }: { offline?: boolean }) {
	const { status, retry } = useInventoryWrites();
	const { t } = useApp();
	if (!status) return null;
	if (status.phase === 'sending')
		return (
			<Copy kind="muted">
				{t('loading')} {status.name}
			</Copy>
		);
	if (status.phase === 'done')
		return (
			<Copy kind="accent">
				{status.name} · {t(status.success)}
			</Copy>
		);
	if (status.phase === 'error')
		return (
			<Copy kind="danger">
				{status.name} · {errorMessage(t, status.error)}
			</Copy>
		);
	return (
		<Panel>
			<Copy kind="danger">
				{status.name} · {t('checkWrite')}
			</Copy>
			<Button label={t('retryWrite')} onPress={retry} disabled={offline} />
		</Panel>
	);
}

export function Pagination({
	offset,
	size,
	total,
	change
}: {
	offset: number;
	size: number;
	total: number;
	change: (offset: number) => void;
}) {
	const { t } = useApp();
	if (offset === 0 && total <= size) return null;
	return (
		<Row>
			<Button
				label={t('previous')}
				disabled={offset === 0}
				onPress={() => change(Math.max(0, offset - size))}
			/>
			<Copy kind="muted">
				{t('page')} {Math.floor(offset / size) + 1}
			</Copy>
			<Button
				label={t('next')}
				disabled={offset + size >= total}
				onPress={() => change(offset + size)}
			/>
		</Row>
	);
}

export const listStyle = { gap: 8, paddingBottom: 16 };

const styles = StyleSheet.create({
	fill: { flex: 1 },
	content: { gap: 12, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16 },
	title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.65 },
	heading: { fontSize: 16, fontWeight: '600' },
	body: { fontSize: 16, lineHeight: 23 },
	muted: { fontSize: 14, lineHeight: 20 },
	danger: { fontSize: 15, lineHeight: 21 },
	accent: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
	row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
	button: {
		alignItems: 'center',
		justifyContent: 'center',
		minHeight: 48,
		minWidth: 48,
		paddingHorizontal: 15,
		paddingVertical: 8,
		borderRadius: 12,
		borderWidth: 1
	},
	buttonLabel: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
	input: { borderWidth: 1, borderRadius: 12, minHeight: 48, paddingHorizontal: 13, fontSize: 16 },
	panel: { gap: 10, borderWidth: 1, padding: 14, borderRadius: 14 },
	itemFrame: { borderWidth: 1, borderRadius: 13, overflow: 'hidden' },
	item: { flexDirection: 'row', alignItems: 'center', minHeight: 65, padding: 10, gap: 10 },
	thumbnail: { width: 34, height: 47, borderRadius: 4 },
	itemText: { flex: 1, gap: 3 },
	loading: { paddingVertical: 18 }
});
