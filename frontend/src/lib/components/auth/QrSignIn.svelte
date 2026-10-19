<script lang="ts">
	import { onMount } from 'svelte';
	import { validQrCredential } from '@spellbook/contracts/auth.ts';
	import { parseQrAuthorizationInput } from '#lib/auth/qr-code.ts';

	let { returnTo }: { returnTo: string } = $props();
	let image = $state('');
	let link = $state('');
	let message = $state('Preparing a sign-in code...');
	let phase = $state<'loading' | 'pending' | 'finished'>('loading');
	let code = '';
	let expires = 0;
	let generation = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let request: AbortController | undefined;
	let polling = false;

	function finish(text: string) {
		clearTimeout(timer);
		phase = 'finished';
		image = '';
		message = text;
	}
	async function post(path: string, body: object) {
		const controller = new AbortController();
		request = controller;
		const timeout = setTimeout(() => controller.abort(), 15000);
		try {
			const response = await fetch(path, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
				cache: 'no-store',
				signal: controller.signal
			});
			if (!response.ok) throw new Error('QR request failed');
			return await response.json();
		} finally {
			clearTimeout(timeout);
			if (request === controller) request = undefined;
		}
	}
	function schedule() {
		clearTimeout(timer);
		if (phase === 'pending' && !polling && !document.hidden && navigator.onLine)
			timer = setTimeout(poll, 3000);
	}
	async function poll() {
		if (phase !== 'pending' || polling) return;
		if (Date.now() >= expires) {
			finish('This code has expired. Create a new code to try again.');
			return;
		}
		const current = generation;
		polling = true;
		try {
			const result = await post('/api/auth/qr/token', { code });
			if (current !== generation) return;
			if (result.status === 'authenticated') {
				finish('Signed in. Opening your account...');
				window.location.assign(returnTo);
			} else if (result.status === 'pending') {
				message = 'Waiting for approval...';
			} else {
				finish(
					result.status === 'denied'
						? 'Sign-in was denied. You can create a new code.'
						: 'This code has expired or has already been used. Create a new code.'
				);
			}
		} catch {
			if (current === generation)
				finish('Unable to confirm sign-in. Reload to check your session, or create a new code.');
		} finally {
			polling = false;
			if (current === generation) schedule();
		}
	}
	async function create() {
		const current = ++generation;
		clearTimeout(timer);
		request?.abort();
		phase = 'loading';
		image = '';
		link = '';
		message = 'Preparing a sign-in code...';
		try {
			const result = await post('/api/auth/qr/requests', { kind: 'browser' });
			if (current !== generation) return;
			if (
				!validQrCredential(result.code) ||
				result.kind !== 'browser' ||
				typeof result.verificationUri !== 'string' ||
				parseQrAuthorizationInput(result.verificationUri, window.location.origin) !== result.code ||
				!Number.isFinite(Date.parse(result.expiresAt))
			)
				throw new Error('Invalid QR response');
			const { toDataURL } = await import('qrcode');
			const rendered = await toDataURL(result.verificationUri, {
				width: 256,
				margin: 4,
				errorCorrectionLevel: 'M'
			});
			if (current !== generation) return;
			code = result.code;
			expires = Date.parse(result.expiresAt);
			link = result.verificationUri;
			image = rendered;
			phase = 'pending';
			message = 'Waiting for approval...';
			schedule();
		} catch {
			if (current === generation)
				finish(
					'Unable to create a sign-in code. Check your connection or sign in with your password.'
				);
		}
	}
	onMount(() => {
		void create();
		document.addEventListener('visibilitychange', schedule);
		window.addEventListener('online', schedule);
		window.addEventListener('offline', schedule);
		return () => {
			generation++;
			clearTimeout(timer);
			request?.abort();
			document.removeEventListener('visibilitychange', schedule);
			window.removeEventListener('online', schedule);
			window.removeEventListener('offline', schedule);
		};
	});
</script>

<section class="qr-sign-in" aria-label="Sign in with the app" aria-busy={phase === 'loading'}>
	<div class="qr-code" class:empty={!image}>
		{#if image}<img
				src={image}
				width="256"
				height="256"
				alt="QR code for this sign-in request"
				class="qr-image"
			/>{/if}
	</div>
	<h2>Sign in with QR code</h2>
	<p class="qr-status text-xs text-text-secondary" role="status">{message}</p>
	{#if phase === 'pending'}
		<details>
			<summary>Copy sign-in link instead</summary><input
				class="input w-full mt-2"
				aria-label="Sign-in link"
				value={link}
				readonly
				onclick={(event) => event.currentTarget.select()}
			/>
		</details>
	{:else if phase === 'finished'}
		<button class="btn btn-secondary" type="button" onclick={create}>Create new code</button>
	{/if}
	<noscript><p>Enable JavaScript for QR sign-in, or use your username and password.</p></noscript>
</section>

<style>
	.qr-sign-in {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		text-align: center;
	}
	.qr-code {
		width: min(100%, 192px);
		aspect-ratio: 1;
		margin-bottom: 0.5rem;
		border-radius: 0.5rem;
		overflow: hidden;
		background: white;
	}
	.qr-code.empty {
		border: 1px dashed var(--color-border);
		background: var(--color-surface);
	}
	.qr-image {
		display: block;
		width: 100%;
		height: auto;
	}
	h2 {
		font-size: 1.125rem;
		font-weight: 600;
		line-height: 1.4;
	}
	.qr-status {
		min-height: 2lh;
	}
	details {
		width: 100%;
	}
	summary {
		min-height: 44px;
		align-content: center;
		cursor: pointer;
		font-size: 0.75rem;
	}
</style>
