<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { enhance } from '$app/forms';
	import AccountLayout from '#lib/components/auth/AccountLayout.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let pending = $state(false);
	let request = $derived(form?.request ?? data.request);
</script>

<svelte:head
	><title>{language.t('ui.Approve.sign.in.Spellbook')}</title><meta
		name="robots"
		content="noindex"
	/><meta name="referrer" content="no-referrer" /></svelte:head
>

<AccountLayout title={language.t('ui.Approve.sign.in')}>
	<div class="space-y-5">
		{#if form?.message}<p role="alert" class="text-error">{language.message(form.message)}</p>{/if}
		{#if request.status === 'pending'}
			<p>
				{language.t('ui.Sign.in.to')}
				{request.kind === 'browser' ? 'another browser' : 'a device'}
				{language.t('ui.as')}
				<strong>{data.reviewedUsername}</strong>?
			</p>
			<p class="text-sm text-text-secondary">
				{language.t(
					'ui.Only.approve.a.code.you.just.scanned.from.your.own.device.Approval.gives.that.device.access.to.your.Spellbook.account'
				)}
			</p>
			<dl class="rounded-xl border border-border p-4 text-sm space-y-2">
				<div>
					<dt class="text-text-secondary">{language.t('ui.Service')}</dt>
					<dd class="break-all">{data.origin}</dd>
				</div>
				<div>
					<dt class="text-text-secondary">{language.t('ui.Request')}</dt>
					<dd class="font-mono">{request.code.slice(0, 8)}</dd>
				</div>
			</dl>
			<form
				method="POST"
				class="flex flex-wrap gap-3"
				aria-busy={pending}
				use:enhance={() => {
					pending = true;
					return async ({ update }) => {
						try {
							await update({ refreshAll: true });
						} finally {
							pending = false;
						}
					};
				}}
			>
				<input type="hidden" name="review" value={data.review} />
				<button name="decision" value="approve" class="btn btn-primary" disabled={pending}
					>{pending ? language.t('ui.Please.wait') : language.t('ui.Approve.sign.in')}</button
				>
				<button name="decision" value="deny" class="btn btn-secondary" disabled={pending}
					>{language.t('ui.Deny')}</button
				>
			</form>
		{:else if request.status === 'approved'}
			<p role="status">
				{language.t('ui.Sign.in.approved.Return.to.the.other.device.to.continue')}
			</p>
		{:else if request.status === 'denied'}
			<p role="status">{language.t('ui.Sign.in.denied.This.request.cannot.be.used')}</p>
		{:else}
			<p role="status">
				{language.t(
					'ui.This.request.has.expired.or.has.already.been.used.Create.a.new.code.on.the.other.device'
				)}
			</p>
		{/if}
		<a href="/app" class="btn btn-secondary">{language.t('ui.Back.to.app')}</a>
	</div>
</AccountLayout>
