<script lang="ts">
	import { cardImageCache, formatByteSize, type ImageCacheStats } from '#lib/cards/image-cache.ts';
	import { useLanguage } from '#lib/i18n/context.ts';

	const language = useLanguage();

	let stats = $state<ImageCacheStats | null>(null);
	let clearing = $state(false);
	let status = $state<'idle' | 'cleared' | 'error'>('idle');

	async function refreshStats() {
		stats = await cardImageCache.getStats();
	}

	$effect(() => {
		if (typeof window === 'undefined') return;
		void refreshStats();
	});

	async function handleClear() {
		if (clearing) return;
		clearing = true;
		status = 'idle';
		try {
			const cleared = await cardImageCache.clear();
			status = cleared ? 'cleared' : 'error';
			await refreshStats();
		} finally {
			clearing = false;
		}
	}

	const summaryText = $derived.by(() => {
		if (!stats) return language.t('imageCache.loading');
		if (!stats.available) return language.t('imageCache.unavailable');
		if (stats.entryCount === 0) return language.t('imageCache.empty');
		return language.t(`imageCache.summary.${language.plural(stats.entryCount)}`, {
			count: language.number(stats.entryCount),
			size: formatByteSize(stats.totalBytes, language.locale)
		});
	});

	const statusMessage = $derived(
		status === 'cleared'
			? language.t('imageCache.cleared')
			: status === 'error'
				? language.t('imageCache.clearError')
				: ''
	);

	const clearDisabled = $derived(clearing || !stats || !stats.available || stats.entryCount === 0);
</script>

<section class="image-cache-settings" aria-labelledby="image-cache-title">
	<h2 id="image-cache-title">{language.t('imageCache.title')}</h2>
	<p class="text-sm text-text-secondary">
		{language.t('imageCache.description', {
			maxEntries: language.number(cardImageCache.maxEntries),
			maxSize: formatByteSize(cardImageCache.maxBytes, language.locale)
		})}
	</p>
	<p class="text-sm text-text-secondary">{summaryText}</p>
	<div class="image-cache-actions">
		<button type="button" class="btn btn-secondary" disabled={clearDisabled} onclick={handleClear}>
			{clearing ? language.t('imageCache.clearing') : language.t('imageCache.clear')}
		</button>
		{#if statusMessage}
			<p
				role="status"
				class="text-sm"
				class:text-error={status === 'error'}
				class:text-text-secondary={status !== 'error'}
			>
				{statusMessage}
			</p>
		{/if}
	</div>
</section>

<style>
	.image-cache-settings {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 2.5rem;
		max-width: 720px;
	}
	.image-cache-settings h2 {
		font-family: var(--font-display);
		font-size: var(--text-section-title);
		line-height: var(--text-section-title--line-height);
	}
	.image-cache-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
	}
</style>
