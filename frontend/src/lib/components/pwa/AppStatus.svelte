<script lang="ts">
	import { pwaState } from '#lib/pwa/state.svelte.ts';
</script>

{#if !pwaState.online || pwaState.updateReady || pwaState.updating || pwaState.updateError}
	<aside class="app-status" aria-label="App status">
		<div role="status">
			{#if !pwaState.online}
				<p>Your browser is offline. Reconnect before loading account data or saving changes.</p>
			{/if}
			{#if pwaState.updateReady || pwaState.updating}
				<p>
					An update is ready. Save your work before reloading. This tab stays open until you choose
					to update.
				</p>
			{/if}
			{#if pwaState.updateError}<p>{pwaState.updateError}</p>{/if}
		</div>
		{#if pwaState.updateReady || pwaState.updating}
			<button
				type="button"
				class="btn btn-secondary"
				disabled={pwaState.updating}
				onclick={() => pwaState.reloadForUpdate()}
			>
				{pwaState.updating ? 'Updating…' : 'Update and reload'}
			</button>
		{/if}
	</aside>
{/if}

<style>
	.app-status {
		margin: 0.75rem 1rem;
		padding: 1rem;
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		background: var(--color-background);
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.app-status div {
		flex: 1 1 20rem;
	}
</style>
