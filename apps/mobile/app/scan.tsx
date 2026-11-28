import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Image } from 'react-native';
import { HttpError, writeUnconfirmed, type Schema } from '../src/api';
import { errorMessage, type Message } from '../src/i18n';
import { useScanRecovery } from '../src/scan-recovery';
import { useApp } from '../src/session';
import { Button, Copy, Item, Loading, Panel, Row, Screen } from '../src/ui';

const maxUpload = 10 * 1024 * 1024;

export default function ScanScreen() {
	const { api, t } = useApp();
	const { photo: recovered, forgetPhoto, pick } = useScanRecovery();
	const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset>();
	const [result, setResult] = useState<Schema<'ScanResult'>>();
	const [status, setStatus] = useState<Message>();
	const [error, setError] = useState<unknown>();
	const [busy, setBusy] = useState(false);
	const lock = useRef(false);
	useEffect(() => {
		if (!recovered || busy) return;
		setPhoto(recovered);
		setResult(undefined);
		setStatus(undefined);
		setError(undefined);
		forgetPhoto();
	}, [recovered, busy, forgetPhoto]);

	const choose = async (camera: boolean) => {
		if (lock.current) return;
		lock.current = true;
		setBusy(true);
		setError(undefined);
		setStatus(undefined);
		try {
			if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
				setStatus('permission');
				return;
			}
			const selected = await pick(() =>
				camera
					? ImagePicker.launchCameraAsync({ mediaTypes: ['images'] })
					: ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] })
			);
			if (!selected.canceled) {
				setPhoto(selected.assets[0]);
				setResult(undefined);
			}
		} catch (failure) {
			setError(failure);
		} finally {
			lock.current = false;
			setBusy(false);
		}
	};

	const upload = async () => {
		if (!photo || lock.current) return;
		lock.current = true;
		setBusy(true);
		setError(undefined);
		setStatus(undefined);
		setResult(undefined);
		let file: File | undefined;
		let sent = false;
		try {
			const context = ImageManipulator.manipulate(photo.uri);
			try {
				if (Math.max(photo.width, photo.height) > 2000) {
					context.resize(photo.width >= photo.height ? { width: 2000 } : { height: 2000 });
				}
				const rendered = await context.renderAsync();
				try {
					const jpeg = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
					file = new File(jpeg.uri);
				} finally {
					rendered.release();
				}
			} finally {
				context.release();
			}
			if (file.size > maxUpload) {
				setStatus('photoTooLarge');
				return;
			}
			sent = true;
			const { session } = await api('post', '/api/v1/mtg/scan/sessions', {});
			const uploaded = await api('post', '/api/v1/mtg/scan/sessions/{sessionId}/frames', {
				path: { sessionId: session.id },
				body: file,
				contentType: 'image/jpeg'
			});
			setResult(uploaded.result);
		} catch (failure) {
			if (sent && writeUnconfirmed(failure)) setStatus('uploadUnknown');
			else if (failure instanceof HttpError && failure.status === 413) setStatus('photoTooLarge');
			else setError(failure);
		} finally {
			try {
				file?.delete();
			} catch {
				/* The OS can purge this temporary cache file. */
			}
			lock.current = false;
			setBusy(false);
		}
	};

	return (
		<Screen scroll>
			<Copy kind="title">{t('scan')}</Copy>
			<Copy>{t('scanHelp')}</Copy>
			<Row>
				<Button label={t('takePhoto')} disabled={busy} onPress={() => void choose(true)} />
				<Button label={t('choosePhoto')} disabled={busy} onPress={() => void choose(false)} />
			</Row>
			{photo ? (
				<>
					<Image
						source={{ uri: photo.uri }}
						accessibilityLabel={t('photo')}
						resizeMode="contain"
						style={{ height: 250, width: '100%', borderRadius: 12 }}
					/>
					<Button
						tone="primary"
						label={t('upload')}
						disabled={busy || !!result}
						onPress={() => void upload()}
					/>
				</>
			) : null}
			{busy ? <Loading /> : null}
			{status ? <Copy kind="danger">{t(status)}</Copy> : null}
			{error ? <Copy kind="danger">{errorMessage(t, error)}</Copy> : null}
			{result ? (
				<Panel>
					<Copy kind="heading">{t(result.status)}</Copy>
					{result.embeddingModelVersion === 'stub-v1' ? (
						<Copy kind="muted">{t('stub')}</Copy>
					) : null}
					{result.candidates.map((candidate) => (
						<Item
							key={candidate.catalogCardId}
							title={candidate.name}
							subtitle={`${candidate.setCode.toUpperCase()} · ${candidate.collectorNumber}`}
							image={candidate.imageUri}
						/>
					))}
				</Panel>
			) : null}
		</Screen>
	);
}
