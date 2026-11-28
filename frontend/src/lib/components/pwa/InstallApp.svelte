<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import type { AppRelease } from '#lib/pwa/app-release.ts';
	import { pwaState } from '#lib/pwa/state.svelte.ts';
	let { release }: { release: AppRelease } = $props();
	let { android, testFlightUrl, appStoreUrl } = $derived(release);
	let message = $state('');
	async function install() {
		const result = await pwaState.install();
		message =
			result === 'accepted'
				? language.t(
						'ui.Installation.requested.Open.Spellbook.from.your.home.screen.or.app.launcher.when.ready'
					)
				: result === 'dismissed'
					? language.t('ui.Installation.cancelled.You.can.still.use.Spellbook.in.this.browser')
					: language.t('ui.Use.your.browser.menu.to.install.Spellbook.if.supported');
	}
</script>

<div class="install-app">
	<div class="rounded-lg border border-border p-4 space-y-3 [overflow-wrap:anywhere]">
		<h3 class="font-semibold">Android</h3>
		<a class="btn btn-secondary" href={android.href}>
			{language.t('install.android.download')}
		</a>
		{#if !android.direct}
			<p>{language.t('install.android.github')}</p>
		{:else if android.version || android.minAndroid || android.size}
			<dl class="flex flex-wrap gap-x-6 gap-y-2">
				{#if android.version}
					<div>
						<dt>{language.t('install.android.version')}</dt>
						<dd>{android.version}</dd>
					</div>
				{/if}
				{#if android.minAndroid}
					<div>
						<dt>{language.t('install.android.minimum')}</dt>
						<dd>{android.minAndroid}</dd>
					</div>
				{/if}
				{#if android.size}
					<div>
						<dt>{language.t('install.android.size')}</dt>
						<dd>{android.size}</dd>
					</div>
				{/if}
			</dl>
		{/if}
		<details>
			<summary>{language.t('install.android.instructions')}</summary>
			{#if android.sha256}
				<p>{language.t('install.android.checksum')} <code>{android.sha256}</code></p>
			{/if}
			<p>{language.t('install.android.openFile')}</p>
			<p>{language.t('install.android.allowSource')}</p>
		</details>
	</div>
	{#if pwaState.standalone}
		<p>{language.t('ui.Spellbook.is.running.as.an.installed.app')}</p>
	{:else}
		{#if pwaState.canInstall}
			<button
				type="button"
				class="btn btn-primary"
				disabled={pwaState.installing}
				onclick={install}
			>
				{language.t('ui.Install.Spellbook')}
			</button>
		{/if}
		<details>
			<summary>{language.t('ui.How.to.install.Spellbook')}</summary>
			<p>
				{language.t(
					'ui.In.Chrome.or.Edge.open.the.browser.menu.and.choose.Install.app.or.Add.to.home.screen'
				)}
			</p>
			<p>
				{language.t(
					'ui.If.no.install.option.appears.keep.using.Spellbook.in.your.browser.Installation.needs.HTTPS.outside.localhost'
				)}
			</p>
		</details>
		<p>{language.t('ui.Spellbook.needs.an.internet.connection.for.account.data.and.scanning')}</p>
		<p role="status">{message}</p>
	{/if}
	{#if !pwaState.standalone || testFlightUrl || appStoreUrl}
		<div>
			<h3 class="font-semibold">iOS</h3>
			{#if !pwaState.standalone}
				<p>
					{language.t(
						'ui.On.iPhone.or.iPad.open.this.site.in.Safari.tap.Share.then.Add.to.Home.Screen'
					)}
				</p>
			{/if}
			{#if testFlightUrl || appStoreUrl}
				<div class="mt-2 flex flex-wrap gap-2">
					{#if testFlightUrl}
						<a class="btn btn-secondary" href={testFlightUrl}>
							{language.t('install.ios.testFlight')}
						</a>
					{/if}
					{#if appStoreUrl}
						<a class="btn btn-secondary" href={appStoreUrl}>{language.t('install.ios.appStore')}</a>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

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
