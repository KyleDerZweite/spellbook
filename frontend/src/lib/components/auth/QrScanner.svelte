<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { onMount, onDestroy } from 'svelte';
	import type { IScannerControls } from '@zxing/browser';

	let { onScan }: { onScan: (value: string) => void } = $props();
	let video: HTMLVideoElement | undefined = $state();
	let active = $state(false);
	let message = $state(
		language.t('ui.Scan.the.QR.code.shown.on.the.device.you.want.to.sign.in.to')
	);
	let manual = $state('');
	let controls: IScannerControls | undefined;
	let camera: MediaStream | undefined;
	let generation = 0;

	async function stopScanner(control?: IScannerControls) {
		try {
			// ZXing's typed-void stop can reject while disabling an unsupported torch.
			await control?.stop();
		} catch {
			// The owned camera tracks are released separately from decoder cleanup.
		}
	}

	function stop() {
		generation++;
		void stopScanner(controls);
		controls = undefined;
		camera?.getTracks().forEach((track) => track.stop());
		camera = undefined;
		if (video) video.srcObject = null;
		active = false;
	}

	async function start() {
		stop();
		if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
			message = language.t(
				'ui.Camera.scanning.needs.HTTPS.and.camera.access.You.can.paste.the.sign.in.link.below'
			);
			return;
		}
		active = true;
		message = language.t('ui.Point.your.camera.at.the.sign.in.QR.code');
		const current = generation;
		try {
			const { BrowserQRCodeReader } = await import('@zxing/browser');
			if (current !== generation || !video) return;
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' } },
				audio: false
			});
			if (current !== generation || !video) {
				stream.getTracks().forEach((track) => track.stop());
				return;
			}
			camera = stream;
			const reader = new BrowserQRCodeReader();
			const scanning = await reader.decodeFromStream(stream, video, (result, _error, running) => {
				if (current !== generation) {
					void stopScanner(running);
					return;
				}
				if (result) {
					void stopScanner(running);
					stop();
					message = language.t('ui.Code.found.Review.the.sign.in.request.before.approving');
					onScan(result.getText());
				}
			});
			if (current === generation) controls = scanning;
			else void stopScanner(scanning);
		} catch {
			if (current !== generation) return;
			stop();
			message = language.t(
				'ui.Unable.to.open.the.camera.Check.camera.permission.or.paste.the.sign.in.link.below'
			);
		}
	}

	onMount(() => {
		const pause = () => {
			if (document.hidden && active) {
				stop();
				message = language.t('ui.Camera.paused.Start.scanning.when.you.return');
			}
		};
		document.addEventListener('visibilitychange', pause);
		return () => document.removeEventListener('visibilitychange', pause);
	});
	onDestroy(stop);
</script>

<section class="space-y-4" aria-label={language.t('ui.Sign.in.QR.scanner')}>
	<p class="text-sm text-text-secondary" role="status">{message}</p>
	<video
		bind:this={video}
		class="aspect-square w-full rounded-xl border border-border bg-black object-cover"
		class:hidden={!active}
		autoplay
		muted
		playsinline
		aria-label={language.t('ui.QR.camera.preview')}
	></video>
	<div class="flex flex-wrap gap-3">
		<button type="button" class="btn btn-primary" onclick={start} disabled={active}
			>{language.t('ui.Start.camera')}</button
		>
		{#if active}<button type="button" class="btn btn-secondary" onclick={stop}
				>{language.t('ui.Stop.camera')}</button
			>{/if}
	</div>
	<form
		class="space-y-3"
		onsubmit={(event) => {
			event.preventDefault();
			stop();
			onScan(manual);
		}}
	>
		<label for="qr-sign-in-link" class="label"
			>{language.t('ui.Or.paste.the.sign.in.link.or.code')}</label
		>
		<input
			id="qr-sign-in-link"
			class="input w-full"
			bind:value={manual}
			required
			maxlength="2048"
			autocomplete="off"
			spellcheck="false"
		/>
		<button type="submit" class="btn btn-secondary">{language.t('ui.Review.request')}</button>
	</form>
</section>
