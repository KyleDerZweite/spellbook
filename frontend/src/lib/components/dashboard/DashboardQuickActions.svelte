<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import Package from '@lucide/svelte/icons/package';
	import Plus from '@lucide/svelte/icons/plus';
</script>

<section class="panel dashboard-surface quick-actions" aria-label={language.t('ui.Quick.Actions')}>
	<h2>{language.t('ui.Quick.Actions')}</h2>
	<nav aria-label={language.t('ui.Dashboard.quick.actions')}>
		<a href="/mtg/search"
			><Plus size={16} aria-hidden="true" class="shrink-0" /><span
				>{language.t('ui.Add.cards')}</span
			><ArrowUpRight size={16} aria-hidden="true" class="arrow shrink-0" /></a
		>
		<a href="/mtg/decks?flow=create"
			><Plus size={16} aria-hidden="true" class="shrink-0" /><span>{language.t('ui.New.deck')}</span
			><ArrowUpRight size={16} aria-hidden="true" class="arrow shrink-0" /></a
		>
		<a href="/mtg/inventory?view=groups">
			<Package size={16} aria-hidden="true" class="shrink-0" />
			<span>{language.t('ui.Manage.boxes')}</span><ArrowUpRight
				size={16}
				aria-hidden="true"
				class="arrow shrink-0"
			/>
		</a>
	</nav>
</section>

<style>
	.panel {
		box-sizing: border-box;
		min-width: 0;
		min-height: 415px;
		padding: 24px 16px;
		border-radius: 10px;
		color: var(--color-text-primary);
		font-family: var(--font-interface);
		font-size: var(--text-control);
		line-height: var(--text-control--line-height);
		font-weight: 500;
	}
	h2 {
		margin: 0 0 24px;
		font-family: var(--font-display);
		font-size: var(--text-section-title);
		line-height: var(--text-section-title--line-height);
		font-weight: 400;
	}
	nav {
		display: grid;
		gap: 12px;
	}
	a {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 60px;
		padding: 12px;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		color: inherit;
		text-decoration: none;
		overflow-wrap: anywhere;
	}
	a:hover {
		background: var(--color-surface);
	}
	a:focus-visible {
		outline: 2px solid var(--color-chart-primary);
		outline-offset: 3px;
	}
	a :global(svg) {
		flex: none;
	}
	a :global(.arrow) {
		margin-left: auto;
		color: var(--color-text-secondary);
	}
	@media (max-width: 620px) {
		.panel {
			min-height: 0;
		}
	}
</style>
