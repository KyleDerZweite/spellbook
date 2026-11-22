<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { enhance } from '$app/forms';
	import ConfirmationDialog from '#lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { DEVICE_NAME_MAX_LENGTH, type LinkedDevice } from '@spellbook/contracts/devices.ts';
	import type { SubmitFunction } from '$app/forms';

	let {
		devices,
		result
	}: {
		devices: LinkedDevice[];
		result?: { success: boolean; message: string } | null;
	} = $props();
	let pending = $state<string | null>(null);
	let revoking = $state<LinkedDevice | null>(null);
	let revokeError = $state('');
	let revokeTrigger: HTMLButtonElement | null = null;

	const label = (device: LinkedDevice) => device.name ?? language.t('devices.unnamed');
	const when = (value: string) =>
		language.date(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });
	const submit =
		(deviceId: string): SubmitFunction =>
		() => {
			pending = deviceId;
			revokeError = '';
			return async ({ result: outcome, update }) => {
				try {
					await update({ reset: false });
					if (outcome.type === 'success') revoking = null;
					else if (outcome.type === 'failure') revokeError = String(outcome.data?.message ?? '');
					else if (outcome.type === 'error')
						revokeError = language.t('notice.Could.not.update.the.device.Try.again');
				} finally {
					pending = null;
				}
			};
		};
</script>

<section class="linked-devices" aria-labelledby="linked-devices-title">
	<h2 id="linked-devices-title">{language.t('devices.title')}</h2>
	<p class="text-sm text-text-secondary">{language.t('devices.description')}</p>
	{#if result?.message}<p
			role="status"
			class="text-sm"
			class:text-error={!result.success}
			class:text-text-secondary={result.success}
		>
			{language.message(result.message)}
		</p>{/if}
	{#if devices.length === 0}
		<p class="text-sm text-text-secondary">{language.t('devices.empty')}</p>
	{:else}
		<ul class="device-list">
			{#each devices as device (device.id)}
				<li class="device">
					<div class="device-summary">
						<p class="device-name">{label(device)}</p>
						<p class="text-sm text-text-secondary">
							{device.type
								? language.t(`device.type.${device.type}`)
								: language.t('qr.device.notReported')}
							· {language.t('devices.linked', { date: when(device.createdAt) })}
							· {language.t('devices.lastSeen', { date: when(device.lastSeenAt) })}
						</p>
					</div>
					<form
						method="POST"
						class="device-rename"
						aria-busy={pending === device.id}
						use:enhance={submit(device.id)}
					>
						<input type="hidden" name="intent" value="device-rename" />
						<input type="hidden" name="deviceId" value={device.id} />
						<label class="label" for="device-name-{device.id}">{language.t('devices.name')}</label>
						<div class="device-actions">
							<input
								id="device-name-{device.id}"
								name="name"
								class="input"
								value={device.name ?? ''}
								required
								maxlength={DEVICE_NAME_MAX_LENGTH}
								autocomplete="off"
								disabled={pending === device.id}
							/>
							<button
								class="btn btn-secondary"
								disabled={pending === device.id}
								aria-label={language.t('devices.rename.aria', { name: label(device) })}
								>{language.t('devices.rename')}</button
							>
							<button
								type="button"
								class="btn btn-secondary"
								disabled={pending === device.id}
								aria-label={language.t('devices.revoke.aria', { name: label(device) })}
								onclick={(event) => {
									revokeTrigger = event.currentTarget;
									revokeError = '';
									revoking = device;
								}}>{language.t('devices.revoke')}</button
							>
						</div>
					</form>
					<noscript>
						<form method="POST" class="device-actions">
							<input type="hidden" name="intent" value="device-revoke" />
							<input type="hidden" name="deviceId" value={device.id} />
							<label class="flex items-center gap-2">
								<input type="checkbox" name="confirm" value="yes" required />
								{language.t('devices.revoke.title', { name: label(device) })}
							</label>
							<button class="btn btn-secondary">{language.t('devices.revoke.confirm')}</button>
						</form>
					</noscript>
				</li>
			{/each}
		</ul>
	{/if}
</section>

{#if revoking}
	{@const target = revoking}
	<ConfirmationDialog
		open
		title={language.t('devices.revoke.title', { name: label(target) })}
		description={language.t('devices.revoke.description')}
		pending={pending === target.id}
		error={revokeError}
		onCancel={() => (revoking = null)}
		onCloseAutoFocus={(event) => {
			event.preventDefault();
			revokeTrigger?.focus({ preventScroll: true });
		}}
	>
		<form method="POST" use:enhance={submit(target.id)}>
			<input type="hidden" name="intent" value="device-revoke" />
			<input type="hidden" name="deviceId" value={target.id} />
			<input type="hidden" name="confirm" value="yes" />
			<button class="btn btn-primary" disabled={pending === target.id}
				>{pending === target.id
					? language.t('ui.Please.wait')
					: language.t('devices.revoke.confirm')}</button
			>
		</form>
	</ConfirmationDialog>
{/if}

<style>
	.linked-devices {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 2.5rem;
		max-width: 720px;
	}
	.linked-devices h2 {
		font-family: var(--font-display);
		font-size: 1.5rem;
	}
	.device-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.device {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		padding: 1rem;
	}
	.device-name {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.device-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.device-actions .input {
		flex: 1 1 14rem;
		min-width: 0;
	}
</style>
