<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { page } from '$app/state';
	import IdCard from '@lucide/svelte/icons/id-card';
	import Lock from '@lucide/svelte/icons/lock';
	import Package from '@lucide/svelte/icons/package';
	import User from '@lucide/svelte/icons/user';
	import type { LayoutProps } from './$types';
	let { children }: LayoutProps = $props();
	const links = $derived([
		{ href: '/settings', label: language.t('ui.Profile'), icon: User },
		{ href: '/settings/profile-card', label: language.t('ui.Profile.Card'), icon: IdCard },
		{ href: '/settings/password', label: language.t('ui.Password'), icon: Lock },
		{ href: '/settings/physical-boxes', label: language.t('physicalBoxes.title'), icon: Package }
	]);
</script>

<div class="workspace-container">
	<div class="settings-frame">
		<nav class="settings-nav" aria-label={language.t('ui.Settings')}>
			{#each links as link}
				{@const Icon = link.icon}
				<a href={link.href} aria-current={page.url.pathname === link.href ? 'page' : undefined}>
					<Icon size={16} aria-hidden="true" class="shrink-0" />{link.label}
				</a>
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
		padding-top: 0.25rem;
	}
	.settings-nav a {
		display: flex;
		align-items: center;
		gap: var(--space-control-inline);
		min-height: 44px;
		padding: 0.25rem 0;
		border-bottom: 1px solid transparent;
		color: var(--color-text-secondary);
		font-size: var(--text-control);
		line-height: var(--text-control--line-height);
		font-weight: 500;
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
