<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { IScannerControls } from '@zxing/browser';

	let { onScan }: { onScan: (value: string) => void } = $props();
	let video: HTMLVideoElement | undefined = $state();
	let active = $state(false);
	let message = $state('Scan the QR code shown on the device you want to sign in to.');
	let manual = $state('');
	let controls: IScannerControls | undefined;
	let generation = 0;

	function stop() {
		generation++;
		controls?.stop();
		controls = undefined;
		const stream = video?.srcObject;
		if (stream && typeof MediaStream !== 'undefined' && stream instanceof MediaStream)
			stream.getTracks().forEach((track) => track.stop());
		if (video) video.srcObject = null;
		active = false;
	}

	async function start() {
		stop();
		if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
			message =
				'Camera scanning needs HTTPS and camera access. You can paste the sign-in link below.';
			return;
		}
		active = true;
		message = 'Point your camera at the sign-in QR code.';
		const current = generation;
		try {
			const { BrowserQRCodeReader } = await import('@zxing/browser');
			if (current !== generation || !video) return;
			const reader = new BrowserQRCodeReader();
			const scanning = await reader.decodeFromConstraints(
				{ video: { facingMode: { ideal: 'environment' } }, audio: false },
				video,
				(result, _error, running) => {
					if (current !== generation) {
						running.stop();
						return;
					}
					if (result) {
						running.stop();
						stop();
						message = 'Code found. Review the sign-in request before approving.';
						onScan(result.getText());
					}
				}
			);
			if (current === generation) controls = scanning;
			else scanning.stop();
		} catch {
			if (current !== generation) return;
			stop();
			message =
				'Unable to open the camera. Check camera permission or paste the sign-in link below.';
		}
	}

	onMount(() => {
		const pause = () => {
			if (document.hidden && active) {
				stop();
				message = 'Camera paused. Start scanning when you return.';
			}
		};
		document.addEventListener('visibilitychange', pause);
		return () => document.removeEventListener('visibilitychange', pause);
	});
	onDestroy(stop);
</script>

<section class="space-y-4" aria-label="Sign-in QR scanner">
	<p class="text-sm text-text-secondary" role="status">{message}</p>
	<video
		bind:this={video}
		class="aspect-square w-full rounded-xl border border-border bg-black object-cover"
		class:hidden={!active}
		autoplay
		muted
		playsinline
		aria-label="QR camera preview"
	></video>
	<div class="flex flex-wrap gap-3">
		<button type="button" class="btn btn-primary" onclick={start} disabled={active}
			>Start camera</button
		>
		{#if active}<button type="button" class="btn btn-secondary" onclick={stop}>Stop camera</button
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
		<label for="qr-sign-in-link" class="label">Or paste the sign-in link or code</label>
		<input
			id="qr-sign-in-link"
			class="input w-full"
			bind:value={manual}
			required
			maxlength="2048"
			autocomplete="off"
			spellcheck="false"
		/>
		<button type="submit" class="btn btn-secondary">Review request</button>
	</form>
</section>
