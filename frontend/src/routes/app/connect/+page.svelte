<script lang="ts">
	import { goto } from '$app/navigation';
	import { parseQrAuthorizationInput } from '#lib/auth/qr-code.ts';
	import QrScanner from '#lib/components/auth/QrScanner.svelte';
	let message = $state('');
	function scan(value: string) {
		const code = parseQrAuthorizationInput(value, window.location.origin);
		if (!code) {
			message =
				'Use a Spellbook sign-in QR code from this service. Links to other sites are not accepted.';
			return;
		}
		void goto(`/auth/approve?code=${encodeURIComponent(code)}`);
	}
</script>

<svelte:head
	><title>Connect device | Spellbook</title><meta name="robots" content="noindex" /><meta
		name="referrer"
		content="no-referrer"
	/></svelte:head
>

<div class="mx-auto w-full max-w-lg px-4 py-8 space-y-6">
	<header class="space-y-2">
		<h1 class="text-3xl font-semibold">Connect device</h1>
		<p class="text-text-secondary">
			Scan the code on the device you want to sign in to. You will review the request before
			approving.
		</p>
	</header>
	{#if message}<p role="alert" class="text-error">{message}</p>{/if}
	<QrScanner onScan={scan} />
	<a href="/app" class="btn btn-secondary">Back to app</a>
</div>
