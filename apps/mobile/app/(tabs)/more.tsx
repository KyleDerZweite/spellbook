import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../src/i18n';
import { useApp } from '../../src/session';
import { normalizeOrigin, type Preferences } from '../../src/settings';
import { Button, Copy, Field, Panel, Row, Screen } from '../../src/ui';

export default function SettingsScreen() {
	const {
		preferences,
		session,
		suspended,
		checkingSession,
		checkSession,
		notice,
		t,
		updatePreferences,
		signOut
	} = useApp();
	const [draft, setDraft] = useState(preferences.origin);
	const [invalid, setInvalid] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<unknown>();
	const router = useRouter();
	useEffect(() => {
		setDraft(preferences.origin);
	}, [preferences.origin]);

	const save = async (changes: Partial<Preferences>) => {
		setError(undefined);
		try {
			await updatePreferences(changes);
		} catch (failure) {
			setError(failure);
		}
	};
	const logout = async () => {
		setPending(true);
		setError(undefined);
		try {
			await signOut();
		} catch (failure) {
			setError(failure);
		} finally {
			setPending(false);
		}
	};

	return (
		<Screen inset scroll>
			<Copy kind="title">{t('settings')}</Copy>
			{notice ? <Copy kind="muted">{t(notice)}</Copy> : null}
			{error ? <Copy kind="danger">{errorMessage(t, error)}</Copy> : null}
			<Panel>
				<Copy kind="heading">{t('account')}</Copy>
				{session ? (
					<>
						<Copy>{session.user.username}</Copy>
						<Copy kind="muted">{t(session.device ? 'linkedDevice' : 'passwordSession')}</Copy>
						<Copy kind="muted">
							{t('expires')} {new Date(session.expiresAt).toLocaleString(preferences.language)}
						</Copy>
					</>
				) : suspended ? (
					<>
						<Copy>{t('sessionNeedsCheck')}</Copy>
						<Button
							label={t(checkingSession ? 'loading' : 'retry')}
							disabled={checkingSession}
							onPress={() => void checkSession()}
						/>
					</>
				) : (
					<>
						<Copy kind="muted">{t('signedOut')}</Copy>
						<Button
							tone="primary"
							label={t('signIn')}
							disabled={pending || !preferences.origin}
							onPress={() => router.push('/sign-in')}
						/>
					</>
				)}
				{(session || suspended) && (
					<Button
						tone="danger"
						label={t('signOut')}
						disabled={pending}
						onPress={() => void logout()}
					/>
				)}
			</Panel>
			<Panel>
				<Copy kind="heading">{t('server')}</Copy>
				{session || suspended ? (
					<Copy>{preferences.origin}</Copy>
				) : (
					<Field
						label={t('serverUrl')}
						autoCapitalize="none"
						autoCorrect={false}
						keyboardType="url"
						value={draft}
						onChangeText={(value) => {
							setDraft(value);
							setInvalid(false);
						}}
					/>
				)}
				<Copy kind="muted">
					{t(session || suspended ? 'switchServer' : __DEV__ ? 'localServerHint' : 'serverHint')}
				</Copy>
				{invalid ? <Copy kind="danger">{t('invalidServer')}</Copy> : null}
				{!session && !suspended && (
					<Button
						label={t('save')}
						disabled={pending || draft === preferences.origin}
						onPress={() => {
							const origin = normalizeOrigin(draft);
							setInvalid(!origin);
							if (origin) void save({ origin });
						}}
					/>
				)}
			</Panel>
			{session && <Button label={t('scan')} onPress={() => router.push('/scan')} />}
			<Panel>
				<Copy kind="heading">{t('appearance')}</Copy>
				<Copy kind="muted">{t('theme')}</Copy>
				<Row>
					{(['system', 'light', 'dark'] as const).map((theme) => (
						<Button
							key={theme}
							label={t(theme)}
							selected={preferences.theme === theme}
							onPress={() => void save({ theme })}
						/>
					))}
				</Row>
				<Copy kind="muted">{t('language')}</Copy>
				<Row>
					{(['en', 'de'] as const).map((language) => (
						<Button
							key={language}
							label={t(language)}
							selected={preferences.language === language}
							onPress={() => void save({ language })}
						/>
					))}
				</Row>
			</Panel>
		</Screen>
	);
}
