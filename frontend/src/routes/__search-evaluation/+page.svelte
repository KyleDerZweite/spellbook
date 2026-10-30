<script lang="ts">
	import { Command, Dialog } from 'bits-ui';
	import { onMount, tick, untrack } from 'svelte';
	import { snapshot } from '$app/navigation';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	type Result = {
		id: string;
		name: string;
		kind: string;
		href: string;
		reason: string;
		aliases?: string[];
	};
	let variant = $state('lexical');
	let ready = $state(false);
	let query = $state('');
	let open = $state(false);
	let selected = $state('');
	let results = $state<Result[]>([]);
	let pending = $state(false);
	let failure = $state('');
	let duration = $state(0);
	let input: HTMLInputElement | null = $state(null);
	let returnFocus: HTMLElement | null = null;
	let sequence = 0;
	const normalize = (value: string) =>
		value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
	function localMatches(value: string): Result[] {
		const q = normalize(value);
		const targets = (data.experiment.targets as Result[]).map((row) => ({
			...row,
			reason: 'Page'
		}));
		if (!q) return targets.slice(0, 5);
		return targets.filter((target) =>
			[target.name, ...(target.aliases ?? [])].some((alias) =>
				q.split(' ').every((token) =>
					normalize(alias)
						.split(' ')
						.some((word) => word.startsWith(token))
				)
			)
		);
	}
	function publish(next: Result[]) {
		results = next;
		if (!next.some((row) => row.id === selected)) selected = next[0]?.id ?? '';
	}
	snapshot({
		id: 'search-evaluation',
		capture: () => ({ variant, query }),
		restore: (state) => {
			variant = state.variant;
			query = state.query;
		}
	});
	onMount(() => {
		ready = true;
		function shortcut(event: KeyboardEvent) {
			if (
				(event.ctrlKey || event.metaKey) &&
				!event.altKey &&
				!event.shiftKey &&
				!event.isComposing &&
				event.key.toLowerCase() === 'k'
			) {
				event.preventDefault();
				event.stopImmediatePropagation();
				if (!open)
					returnFocus =
						document.activeElement instanceof HTMLElement ? document.activeElement : null;
				open = true;
				void tick().then(() => input?.focus());
			}
		}
		window.addEventListener('keydown', shortcut, { capture: true });
		return () => window.removeEventListener('keydown', shortcut, { capture: true });
	});
	$effect(() => {
		const currentQuery = query,
			currentVariant = variant;
		const active = open;
		const currentSequence = ++sequence;
		const controller = new AbortController();
		failure = '';
		pending = false;
		duration = 0;
		untrack(() => publish(localMatches(currentQuery)));
		if (!active || currentQuery.trim().length < 2) return;
		pending = true;
		const started = performance.now();
		const timer = setTimeout(async () => {
			try {
				const response = await fetch('/__search-evaluation/query', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					signal: controller.signal,
					body: JSON.stringify({ query: currentQuery, variant: currentVariant })
				});
				if (!response.ok) throw new Error('Search unavailable. Local page matches remain usable.');
				const value = await response.json();
				if (currentSequence === sequence) {
					publish(value.results);
					duration = performance.now() - started;
				}
			} catch {
				if (currentSequence === sequence && !controller.signal.aborted)
					failure = 'Search unavailable. Local page matches remain usable.';
			} finally {
				if (currentSequence === sequence) {
					pending = false;
					duration = performance.now() - started;
				}
			}
		}, 150);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});
</script>

<svelte:head
	><title>Search evaluation | Spellbook</title><meta
		name="robots"
		content="noindex,nofollow"
	/></svelte:head
>
<div class="workspace-container evaluation-page" data-evaluation-ready={ready}>
	<h1 class="font-display text-2xl">Search evaluation</h1>
	<p class="text-sm text-text-secondary">
		Local experiment · {data.experiment.cards.toLocaleString()} canonical cards · BGE-M3
	</p>
	<label for="evaluation-variant">Search variant</label>
	<select id="evaluation-variant" class="input" bind:value={variant}>
		{#each data.experiment.variants as item}<option value={item.id}>{item.label}</option>{/each}
	</select>
	<p>Power-user search <kbd>Ctrl / Cmd + K</kbd></p>
	<p class="text-sm text-text-secondary">
		Compare queries in the same shortcut menu. This route is disabled in production.
	</p>
</div>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="evaluation-backdrop" />
		<Dialog.Content
			class="surface-menu evaluation-dialog"
			onOpenAutoFocus={(event) => {
				event.preventDefault();
				void tick().then(() => input?.focus());
			}}
			onCloseAutoFocus={(event) => {
				event.preventDefault();
				returnFocus?.focus();
			}}
		>
			<Dialog.Title class="sr-only">Power-user search</Dialog.Title>
			<Dialog.Description class="sr-only"
				>Search cards, synthetic Decks and pages. Arrow keys select a result. Enter opens it.</Dialog.Description
			>
			<Command.Root
				shouldFilter={false}
				vimBindings={false}
				bind:value={selected}
				label="Power-user search"
			>
				<Command.Input
					bind:ref={input}
					bind:value={query}
					aria-label="Power-user search"
					placeholder="Search anything…"
					class="evaluation-input"
					onkeydown={(event) => {
						if (event.isComposing && event.key === 'Enter') event.stopPropagation();
					}}
				/>
				<Command.List class="evaluation-results" aria-busy={pending}>
					<Command.Viewport>
						{#each results as result (result.id)}
							<Command.LinkItem
								value={result.id}
								href={result.href}
								class="evaluation-result"
								onSelect={() => (open = false)}
							>
								<span class="result-symbol" aria-hidden="true"
									>{result.kind === 'card' ? '◇' : result.kind === 'deck' ? '▤' : '↗'}</span
								>
								<span class="result-copy"
									><span>{result.name}</span><span class="result-reason">{result.reason}</span
									></span
								>
								<span class="result-kind">{result.kind}</span>
							</Command.LinkItem>
						{/each}
						{#if !results.length && !pending}<p class="evaluation-empty">No matches</p>{/if}
					</Command.Viewport>
				</Command.List>
			</Command.Root>
			<div class="evaluation-status" role="status" aria-live="polite">
				<span>{failure || (pending ? 'Searching…' : `${results.length} results`)}</span>
				<span>{duration ? `${Math.round(duration)} ms` : ''} <kbd>Esc</kbd></span>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	.evaluation-page {
		display: grid;
		align-content: start;
		gap: 1rem;
		padding-block: 2rem;
	}
	.evaluation-page select {
		max-width: 28rem;
	}
	kbd {
		padding: 0.15rem 0.4rem;
		border: 1px solid var(--color-border);
		border-radius: 0.25rem;
		font-size: 0.75rem;
	}
	:global(.evaluation-backdrop) {
		position: fixed;
		inset: 0;
		z-index: 120;
		background: rgb(0 0 0 / 55%);
	}
	:global(.evaluation-dialog) {
		position: fixed;
		z-index: 121;
		top: 15%;
		left: 50%;
		transform: translateX(-50%);
		width: min(40rem, calc(100vw - 2rem));
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		overflow: hidden;
	}
	:global(.evaluation-input) {
		width: 100%;
		padding: 1rem;
		background: transparent;
		border: 0;
		border-bottom: 1px solid var(--color-border);
		outline: none;
		color: var(--color-text-primary);
	}
	:global(.evaluation-results) {
		max-height: min(55dvh, 32rem);
		overflow-y: auto;
		padding: 0.35rem;
	}
	:global(.evaluation-result) {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.65rem;
		min-height: 52px;
		border-radius: 0.4rem;
		color: var(--color-text-primary);
	}
	:global(.evaluation-result[data-selected]) {
		background: var(--color-muted);
		outline: 1px solid var(--color-border);
	}
	.result-symbol {
		width: 1.25rem;
		text-align: center;
	}
	.result-copy {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
		flex: 1;
	}
	.result-reason {
		color: var(--color-text-secondary);
		font-size: 0.7rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.result-kind {
		color: var(--color-text-muted);
		font-size: 0.7rem;
	}
	.evaluation-status {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		border-top: 1px solid var(--color-border);
		padding: 0.65rem 1rem;
		color: var(--color-text-secondary);
		font-size: 0.7rem;
	}
	.evaluation-empty {
		padding: 1rem;
	}
	@media (max-width: 600px) {
		:global(.evaluation-dialog) {
			top: 8%;
		}
	}
</style>
