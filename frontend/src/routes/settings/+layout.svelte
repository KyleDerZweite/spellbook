<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';
	let { children }: LayoutProps = $props();
	const links = $derived([
		{ href: '/settings', label: language.t('ui.Profile') },
		{ href: '/settings/profile-card', label: language.t('ui.Profile.Card') },
		{ href: '/settings/password', label: language.t('ui.Password') }
	]);
</script>

<div class="workspace-container">
	<div class="settings-frame">
		<nav class="settings-nav" aria-label={language.t('ui.Settings')}>
			{#each links as link}
				<a href={link.href} aria-current={page.url.pathname === link.href ? 'page' : undefined}
					>{link.label}</a
				>
			{/each}
		</nav>
		<div class="settings-content">{@render children()}</div>
	</div>
</div>

<style>
	.settings-frame {
		display: grid;
		grid-template-columns: 160px minmax(0, 1fr);
		gap: 2rem;
		width: 100%;
		max-width: 1120px;
		margin-inline: auto;
	}
	.settings-nav {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
		padding-top: 0.35rem;
	}
	.settings-nav a {
		display: flex;
		align-items: center;
		min-height: 44px;
		padding: 0.25rem 0;
		border-bottom: 1px solid transparent;
		color: var(--color-text-secondary);
		font-size: 0.8125rem;
	}
	.settings-nav a:hover,
	.settings-nav a[aria-current='page'] {
		color: var(--color-text-primary);
	}
	.settings-nav a[aria-current='page'] {
		border-bottom-color: currentColor;
	}
	.settings-content {
		min-width: 0;
	}
	@media (max-width: 1100px) {
		.settings-frame {
			grid-template-columns: minmax(0, 1fr);
			gap: 1.5rem;
			max-width: 900px;
		}
		.settings-nav {
			flex-direction: row;
			flex-wrap: wrap;
			gap: 0.25rem 1.5rem;
			padding: 0;
		}
	}
	@media (max-width: 900px) {
		.settings-frame {
			max-width: 560px;
		}
	}
</style>
