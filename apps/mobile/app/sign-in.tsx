import { useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { HttpError, InvalidResponse, type Schema } from '../src/api';
import { errorMessage, type Message } from '../src/i18n';
import { useApp } from '../src/session';
import { normalizeOrigin } from '../src/settings';
import { Button, Copy, Field, Loading, Panel, Screen } from '../src/ui';

type Challenge = { request: Schema<'QrCreated'>; url: string };
type Mode = 'password' | 'qr';

export default function SignInScreen() {
	const { guestApi, preferences, t, activate } = useApp();
	const operation = useRef<AbortController | null>(null);
	useEffect(() => () => operation.current?.abort(), []);

	const [mode, setMode] = useState<Mode>('password');
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [challenge, setChallenge] = useState<Challenge>();
	const [message, setMessage] = useState<Message>();
	const [error, setError] = useState<unknown>();
	const [busy, setBusy] = useState(false);

	const changeMode = (value: Mode) => {
		operation.current?.abort();
		operation.current = null;
		setBusy(false);
		setMode(value);
		setPassword('');
		setChallenge(undefined);
		setMessage(undefined);
		setError(undefined);
	};

	const authenticate = async () => {
		if (operation.current) return;
		const controller = new AbortController();
		operation.current = controller;
		const { signal } = controller;
		setBusy(true);
		setError(undefined);
		setMessage(undefined);
		try {
			const result = await guestApi('post', '/api/v1/auth/login', {
				body: { username, password },
				signal
			});
			await activate(result.token, signal);
		} catch (failure) {
			if (!signal.aborted) {
				if (failure instanceof HttpError && failure.status === 401)
					setMessage('invalidCredentials');
				else setError(failure);
			}
		} finally {
			if (operation.current === controller) {
				operation.current = null;
				setBusy(false);
			}
		}
	};

	const startQr = async () => {
		if (operation.current) return;
		const controller = new AbortController();
		operation.current = controller;
		const { signal } = controller;
		setBusy(true);
		setChallenge(undefined);
		setMessage(undefined);
		setError(undefined);

		const finish = () => {
			if (operation.current === controller) {
				operation.current = null;
				setBusy(false);
				setChallenge(undefined);
			}
		};

		try {
			const request = await guestApi('post', '/api/v1/auth/qr/requests', {
				body: { kind: 'device', deviceName: 'Spellbook Mobile', deviceType: 'other' },
				signal
			});
			const origin = normalizeOrigin(new URL(request.verificationUri).origin);
			if (!request.requesterSecret || !origin) throw new InvalidResponse();
			if (signal.aborted) return;
			setChallenge({
				request,
				url: `${origin}/auth/approve?code=${encodeURIComponent(request.code)}`
			});
			setBusy(false);

			const schedule = () => {
				const timer = setTimeout(() => {
					signal.removeEventListener('abort', cancel);
					if (!signal.aborted) void poll();
				}, request.interval * 1000);
				const cancel = () => clearTimeout(timer);
				signal.addEventListener('abort', cancel, { once: true });
			};
			const poll = async () => {
				try {
					if (Date.parse(request.expiresAt) <= Date.now()) {
						setMessage('qrEnded');
						finish();
						return;
					}
					const result = await guestApi('post', '/api/v1/auth/qr/token', {
						body: { code: request.code, requesterSecret: request.requesterSecret },
						signal
					});
					if (signal.aborted) return;
					if (result.status === 'pending') {
						schedule();
						return;
					}
					if (result.status === 'authenticated' && result.token) {
						setBusy(true);
						await activate(result.token, signal);
					} else {
						setMessage('qrEnded');
					}
					finish();
				} catch {
					if (!signal.aborted) {
						setMessage('qrInterrupted');
						finish();
					}
				}
			};
			schedule();
		} catch (failure) {
			if (!signal.aborted) {
				setError(failure);
				finish();
			}
		}
	};

	return (
		<Screen scroll>
			<Copy kind="title">{t(mode === 'password' ? 'signIn' : 'linkDevice')}</Copy>
			<Copy kind="muted">{preferences.origin}</Copy>
			{message ? <Copy kind="danger">{t(message)}</Copy> : null}
			{error ? <Copy kind="danger">{errorMessage(t, error)}</Copy> : null}
			{mode === 'password' ? (
				<>
					<Field
						label={t('username')}
						autoCapitalize="none"
						autoCorrect={false}
						autoComplete="username"
						value={username}
						onChangeText={setUsername}
					/>
					<Field
						label={t('password')}
						secureTextEntry
						autoComplete="current-password"
						value={password}
						onChangeText={setPassword}
					/>
					<Button
						tone="primary"
						label={t('signIn')}
						disabled={busy || !username.trim() || !password}
						onPress={() => void authenticate()}
					/>
					<Button label={t('useQr')} disabled={busy} onPress={() => changeMode('qr')} />
				</>
			) : (
				<>
					<Copy>{t('qrHelp')}</Copy>
					{challenge ? (
						<Panel style={{ alignItems: 'center' }}>
							<View
								accessible
								accessibilityLabel={t('qrCode')}
								style={{ backgroundColor: '#fff', padding: 14, borderRadius: 8 }}
							>
								<QRCode value={challenge.url} size={192} />
							</View>
							<Copy kind="heading">
								{challenge.request.code.slice(0, 4)}-{challenge.request.code.slice(4, 8)}
							</Copy>
							<Copy kind="muted">{t('waiting')}</Copy>
							<Button
								label={t('openApproval')}
								disabled={busy}
								onPress={() => {
									void Linking.openURL(challenge.url).catch(setError);
								}}
							/>
						</Panel>
					) : (
						<Button
							tone="primary"
							label={t('linkDevice')}
							disabled={busy}
							onPress={() => void startQr()}
						/>
					)}
					<Button
						label={t('passwordLogin')}
						disabled={busy}
						onPress={() => changeMode('password')}
					/>
				</>
			)}
			{busy ? <Loading /> : null}
		</Screen>
	);
}
