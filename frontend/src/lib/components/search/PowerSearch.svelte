<script lang="ts">
	import { Command, Dialog } from 'bits-ui';
	import { onMount, tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import { authState } from '#lib/auth/state.svelte.ts';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import type { ResourceSubscription } from '#lib/saved-state/workspace.ts';
	import { getSearchSession } from '#lib/search/session.svelte.ts';
	import {
		createPowerSearchReader,
		powerSearchNavigation,
		type PowerSearchReadState
	} from '#lib/search/power-search.ts';
	import PowerSearchIcon from './PowerSearchIcon.svelte';

	const session = getSearchSession();
	let open = $state(false);
	let query = $state('');
	let selected = $state('');
	let input: HTMLInputElement | null = $state(null);
	let readState: PowerSearchReadState = $state.raw({ groups: [], pending: false, error: '' });
	let revision = $state(0);
	let returnFocus: HTMLElement | null = null;
	let resource: ResourceSubscription | undefined;
	let readAccount: string | null = $state(null);
	const account = $derived(
		workspaceSavedState.getState() !== 'expired' &&
			authState.user &&
			workspaceSavedState.isActive(authState.user.accountId)
			? authState.user.accountId
			: null
	);
	const reader = createPowerSearchReader({
		account: () => account,
		changed: (next) => (readState = next)
	});
	const groups = $derived([
		...powerSearchNavigation(query),
		...readState.groups.filter((group) => group.id === 'catalog' || readAccount === account)
	]);
	const rows = $derived(groups.flatMap((group) => group.rows));

	$effect(() => {
		const currentQuery = query,
			currentAccount = account,
			active = open;
		revision;
		untrack(() => {
			readAccount = currentAccount;
			if (active)
				reader.search(
					currentQuery,
					currentAccount,
					currentAccount ? resource?.publication() : undefined
				);
			else reader.clear();
		});
	});
	$effect(() => {
		const currentRows = rows;
		untrack(() => {
			if (!currentRows.some((row) => row.id === selected)) selected = currentRows[0]?.id ?? '';
		});
	});
	afterNavigate(({ shallow }) => {
		if (!shallow) open = false;
	});

	onMount(() => {
		resource = workspaceSavedState.subscribe({
			topics: ['inventory', 'decks'],
			clear: () => {
				reader.clear();
				revision++;
			},
			refresh: async () => {
				revision++;
			}
		});
		function shortcut(event: KeyboardEvent) {
			if (
				!(event.ctrlKey || event.metaKey) ||
				event.altKey ||
				event.shiftKey ||
				event.isComposing ||
				event.key.toLowerCase() !== 'k' ||
				page.url.pathname.startsWith('/__search-evaluation')
			)
				return;
			// Leave existing dialogs and in-flight card writes with their owning controls.
			const otherDialog = [
				...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')
			].some(
				(dialog) =>
					dialog.getClientRects().length > 0 &&
					!dialog.classList.contains('power-search-dialog') &&
					!dialog.classList.contains('search-dialog')
			);
			if (session.pending || otherDialog) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			if (!open) {
				returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
				query = '';
				open = true;
			}
			void tick().then(() => input?.focus());
		}
		window.addEventListener('keydown', shortcut, { capture: true });
		return () => {
			window.removeEventListener('keydown', shortcut, { capture: true });
			resource?.dispose();
			reader.clear();
		};
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="power-search-backdrop" />
		<Dialog.Content
			class="power-search-dialog"
			onOpenAutoFocus={(event) => {
				event.preventDefault();
				void tick().then(() => input?.focus());
			}}
			onCloseAutoFocus={(event) => {
				event.preventDefault();
				if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
			}}
		>
			<Dialog.Title class="sr-only">Power-user search</Dialog.Title>
			<Dialog.Description class="sr-only"
				>Search cards, your Inventory, Decks and Settings. Use arrow keys to navigate, Enter to
				select, and Escape to close.</Dialog.Description
			>
			<Command.Root
				shouldFilter={false}
				vimBindings={false}
				bind:value={selected}
				label="Power-user search"
				class="power-search-command"
			>
				<div class="power-search-field">
					<PowerSearchIcon kind="search" />
					<Command.Input
						bind:ref={input}
						bind:value={query}
						maxlength={300}
						aria-label="Power-user search"
						placeholder="Search cards, inventory, decks and settings..."
						onkeydown={(event) => {
							if (event.isComposing && event.key === 'Enter') event.stopPropagation();
						}}
					/>
				</div>
				<Command.List class="power-search-results" aria-busy={readState.pending}>
					<Command.Viewport>
						{#each groups as group (group.id)}
							<Command.Group>
								<Command.GroupHeading class="power-search-heading"
									>{group.label}</Command.GroupHeading
								>
								<Command.GroupItems>
									{#each group.rows as row (row.id)}
										<Command.LinkItem
											value={row.id}
											href={row.href}
											class="power-search-result"
											data-source={row.kind}
											onSelect={() => (open = false)}
										>
											<span class="power-search-icon"><PowerSearchIcon kind={row.kind} /></span>
											<span class="power-search-copy"
												><span class="power-search-name">{row.name}</span>{#if row.description}<span
														class="power-search-description">{row.description}</span
													>{/if}</span
											>
											<span class="power-search-context"
												>{row.kind === 'catalog'
													? 'Card Search'
													: row.kind === 'inventory'
														? 'Inventory'
														: row.kind.startsWith('deck')
															? 'Deck'
															: row.kind === 'setting'
																? 'Settings'
																: ''}</span
											>
										</Command.LinkItem>
									{/each}
								</Command.GroupItems>
							</Command.Group>
						{/each}
						{#if !rows.length && !readState.pending}<p class="power-search-empty">
								No results found.
							</p>{/if}
					</Command.Viewport>
				</Command.List>
				<div class="power-search-status" role="status" aria-live="polite">
					{#if readState.error}{readState.error}{:else if readState.pending}Searching...{/if}
				</div>
				<div class="power-search-footer" aria-hidden="true">
					<span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>Enter</kbd> Select</span><span
						><kbd>Esc</kbd> Close</span
					>
				</div>
			</Command.Root>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.power-search-backdrop) {
		position: fixed;
		inset: 0;
		background: var(--color-command-overlay);
		z-index: 80;
	}
	:global(.power-search-dialog) {
		position: fixed;
		top: clamp(12px, 14dvh, 120px);
		left: 50%;
		transform: translateX(-50%);
		z-index: 81;
		width: min(580px, calc(100vw - 24px));
		max-height: calc(100dvh - clamp(12px, 14dvh, 120px) - 16px);
		overflow: hidden;
		border: 1px solid var(--color-command-border);
		border-radius: 16px;
		background: var(--color-command);
		color: var(--color-text-primary);
		box-shadow: 0 24px 80px #0006;
		font-family: var(--font-interface);
		font-size: 14px;
		outline: none;
	}
	:global(.power-search-command) {
		display: flex;
		flex-direction: column;
		max-height: inherit;
	}
	.power-search-field {
		display: flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 9px;
		padding: 17px 18px;
		color: var(--color-text-muted);
	}
	.power-search-field :global(input) {
		flex: 1;
		width: 100%;
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--color-text-primary);
		font: inherit;
		outline: none;
	}
	.power-search-field :global(input::placeholder) {
		color: var(--color-text-muted);
		opacity: 1;
	}
	:global(.power-search-results) {
		overflow-y: auto;
		overscroll-behavior: contain;
		min-height: 0;
		max-height: 370px;
		padding: 0 8px 8px;
	}
	:global(.power-search-heading) {
		padding: 9px 8px 5px;
		color: var(--color-text-muted);
		font-size: 12px;
		font-weight: 400;
	}
	:global(.power-search-result) {
		display: flex;
		align-items: center;
		gap: 9px;
		min-height: 33px;
		padding: 7px 9px;
		border-radius: 5px;
		color: var(--color-text-primary);
		text-decoration: none;
		outline: none;
	}
	:global(.power-search-result[data-selected]),
	:global(.power-search-result:hover) {
		background: var(--color-command-selected);
		text-decoration: none;
	}
	:global(.power-search-result:focus-visible) {
		box-shadow: inset 0 0 0 1px var(--color-ring);
	}
	.power-search-icon {
		flex: 0 0 16px;
		align-self: flex-start;
		padding-top: 1px;
		color: var(--color-text-muted);
	}
	.power-search-copy {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 3px;
	}
	.power-search-name,
	.power-search-description {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.power-search-description {
		font-size: 12px;
		color: var(--color-text-muted);
	}
	.power-search-context {
		margin-left: auto;
		padding-left: 8px;
		flex-shrink: 0;
		font-size: 11px;
		color: var(--color-text-muted);
	}
	.power-search-empty {
		padding: 22px 12px;
		text-align: center;
		color: var(--color-text-muted);
	}
	.power-search-status {
		padding: 0 17px;
		color: var(--color-text-muted);
		font-size: 12px;
	}
	.power-search-status:not(:empty) {
		padding-block: 8px;
	}
	.power-search-footer {
		display: flex;
		flex: 0 0 auto;
		flex-wrap: wrap;
		gap: 13px;
		align-items: center;
		padding: 10px 16px;
		border-top: 1px solid var(--color-command-border);
		color: var(--color-text-muted);
	}
	.power-search-footer span {
		display: inline-flex;
		gap: 4px;
		align-items: center;
	}
	.power-search-footer kbd {
		border: 0;
		border-radius: 3px;
		padding: 2px 4px;
		background: var(--color-command-key);
		color: var(--color-text-primary);
		font-family: var(--font-interface);
		font-size: 11px;
	}
	@media (max-width: 600px) {
		.power-search-field :global(input) {
			font-size: 16px;
		}
		.power-search-context {
			font-size: 10px;
		}
	}
</style>
