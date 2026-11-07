<script lang="ts">
	import { page } from '$app/state';
	import { isLocale } from '#lib/i18n/locale.ts';
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	let menu: HTMLDetailsElement;
	let busy = $state(false);
	let failed = $state(false);
	async function change(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		const form = event.currentTarget as HTMLFormElement;
		busy = true;
		failed = false;
		try {
			const response = await fetch(form.action, {
				method: 'POST',
				body: new FormData(form, event.submitter),
				headers: { Accept: 'application/json' }
			});
			if (!response.ok) {
				failed = true;
				return;
			}
			const result = await response.json();
			if (!isLocale(result.locale)) throw new Error('Invalid language response');
			language.select(result.locale);
			menu.open = false;
			menu.querySelector('summary')?.focus();
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window
	onpointerdown={(event) => {
		if (menu.open && event.target instanceof Node && !menu.contains(event.target))
			menu.open = false;
	}}
	onkeydown={(event) => {
		if (event.key === 'Escape' && menu.open) {
			menu.open = false;
			menu.querySelector('summary')?.focus();
		}
	}}
/>
<details class="language-control" bind:this={menu}>
	<summary
		class="btn btn-ghost btn-icon"
		aria-label={language.t('language.choose')}
		title={language.t('language.choose')}
		><span aria-hidden="true">{language.locale === 'de' ? '🇩🇪' : '🇬🇧'}</span></summary
	>
	<form
		method="POST"
		action="/language"
		onsubmit={change}
		aria-label={language.t('language.choose')}
	>
		<input
			type="hidden"
			name="returnTo"
			value={page.url.pathname + page.url.search + page.url.hash}
		/>
		<button
			type="submit"
			name="locale"
			value="de"
			lang="de"
			aria-current={language.locale === 'de' ? 'true' : undefined}
			disabled={busy}>🇩🇪 Deutsch</button
		>
		<button
			type="submit"
			name="locale"
			value="en"
			lang="en"
			aria-current={language.locale === 'en' ? 'true' : undefined}
			disabled={busy}>🇬🇧 English</button
		>
		{#if failed}<p role="alert">{language.t('language.failed')}</p>{/if}
	</form>
</details>

<style>
	.language-control {
		position: relative;
	}
	summary {
		list-style: none;
		min-width: 44px;
		min-height: 44px;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	form {
		position: absolute;
		right: 0;
		top: 100%;
		z-index: 100;
		min-width: 10rem;
		padding: 0.35rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-stone);
		box-shadow: 0 8px 24px #0004;
	}
	button {
		display: block;
		width: 100%;
		min-height: 44px;
		padding: 0.5rem 0.75rem;
		text-align: left;
		border-radius: 0.25rem;
	}
	button:hover,
	button:focus-visible,
	button[aria-current] {
		background: var(--color-slate);
	}
</style>
