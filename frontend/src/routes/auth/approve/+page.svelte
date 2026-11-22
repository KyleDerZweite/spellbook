<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { enhance } from '$app/forms';
	import AccountLayout from '#lib/components/auth/AccountLayout.svelte';
	import { formatQrDisplayCode } from '#lib/auth/qr-code.ts';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let pending = $state(false);
	let request = $derived(form?.request ?? data.request);
	let device = $derived(request.kind === 'device');
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
				{language.t('qr.approval', {
					device: language.t(request.kind === 'browser' ? 'qr.target.browser' : 'qr.target.device'),
					username: data.reviewedUsername
				})}
			</p>
			<p class="text-sm text-text-secondary">
				{language.t(
					'ui.Only.approve.a.code.you.just.scanned.from.your.own.device.Approval.gives.that.device.access.to.your.Spellbook.account'
				)}
			</p>
			{#if device}<p id="device-warning" class="font-semibold">
					{language.t('qr.device.warning')}
				</p>{/if}
			<dl class="rounded-xl border border-border p-4 text-sm space-y-2">
				<div>
					<dt class="text-text-secondary">{language.t('ui.Service')}</dt>
					<dd class="break-all">{data.origin}</dd>
				</div>
				{#if device}
					<div>
						<dt class="text-text-secondary">{language.t('qr.device.name')}</dt>
						<dd class="break-all">
							{request.deviceName ?? language.t('qr.device.notReported')}
						</dd>
					</div>
					<div>
						<dt class="text-text-secondary">{language.t('qr.device.type')}</dt>
						<dd>
							{request.deviceType
								? language.t(`device.type.${request.deviceType}`)
								: language.t('qr.device.notReported')}
						</dd>
					</div>
				{/if}
				<div>
					<dt class="text-text-secondary">{language.t('qr.displayCode')}</dt>
					<dd class="font-mono text-lg">{formatQrDisplayCode(request.code)}</dd>
				</div>
				<div>
					<dt class="text-text-secondary">{language.t('qr.requestedAt')}</dt>
					<dd>
						<time datetime={data.requestedAt}
							>{language.date(new Date(data.requestedAt), {
								dateStyle: 'medium',
								timeStyle: 'short'
							})}</time
						>
					</dd>
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
				{#if device}
					<label class="flex w-full items-start gap-2">
						<input
							type="checkbox"
							name="confirmed"
							value="yes"
							required
							aria-describedby="device-warning"
						/>
						<span>{language.t('qr.device.confirm')}</span>
					</label>
				{/if}
				<button name="decision" value="approve" class="btn btn-primary" disabled={pending}
					>{pending ? language.t('ui.Please.wait') : language.t('ui.Approve.sign.in')}</button
				>
				<button
					name="decision"
					value="deny"
					class="btn btn-secondary"
					formnovalidate
					disabled={pending}>{language.t('ui.Deny')}</button
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
