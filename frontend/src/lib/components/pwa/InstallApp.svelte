<script lang="ts">
	import { pwaState } from '#lib/pwa/state.svelte.ts';
	let message = $state('');
	async function install() {
		const result = await pwaState.install();
		message =
			result === 'accepted'
				? 'Installation requested. Open Spellbook from your home screen or app launcher when ready.'
				: result === 'dismissed'
					? 'Installation cancelled. You can still use Spellbook in this browser.'
					: 'Use your browser menu to install Spellbook if supported.';
	}
</script>

{#if pwaState.standalone}
	<p>Spellbook is running as an installed app.</p>
{:else}
	<div class="install-app">
		{#if pwaState.canInstall}
			<button
				type="button"
				class="btn btn-primary"
				disabled={pwaState.installing}
				onclick={install}
			>
				Install Spellbook
			</button>
		{/if}
		<details>
			<summary>How to install Spellbook</summary>
			<p>In Chrome or Edge, open the browser menu and choose Install app or Add to home screen.</p>
			<p>On iPhone or iPad, open this site in Safari, tap Share, then Add to Home Screen.</p>
			<p>
				If no install option appears, keep using Spellbook in your browser. Installation needs HTTPS
				outside localhost.
			</p>
		</details>
		<p>Spellbook needs an internet connection for account data and scanning.</p>
		<p role="status">{message}</p>
	</div>
{/if}

<style>
	.install-app {
		display: grid;
		gap: 0.75rem;
	}
	summary {
		cursor: pointer;
		min-height: 44px;
		align-content: center;
	}
	details p + p {
		margin-top: 0.5rem;
	}
	p:empty {
		display: none;
	}
</style>
