<script lang="ts">
	import { demoInventoryOperation, mutateDemoInventory } from '#lib/demo/inventory.ts';
	import { demoSaveError } from '#lib/demo/conflict.ts';
	import { goto } from '$app/navigation';
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let pending = $state(false);
	let saveError = $state<ReturnType<typeof demoSaveError>>();
	async function saveDemo(event: SubmitEvent) {
		if (!data.demoSession || !data.user) return;
		event.preventDefault();
		if (pending) return;
		const form = event.currentTarget as HTMLFormElement;
		pending = true;
		saveError = undefined;
		try {
			await mutateDemoInventory(
				data.demoSession,
				demoInventoryOperation(new URL(form.action)),
				new FormData(form),
				data.user.accountId,
				data.demoWriteGeneration
			);
			await goto(data.returnTo, { invalidateAll: true });
		} catch (cause) {
			saveError = demoSaveError(cause);
		} finally {
			pending = false;
		}
	}
</script>

<svelte:head>
	<title>{data.detail?.entry.name ?? 'Inventory'} | Inventory | Spellbook</title>
</svelte:head>
{#if data.detail}<div class="workspace-container">
		<a href={data.returnTo}>{language.t('ui.Back.to.Inventory')}</a>
		<h1>{data.detail.entry.name}</h1>
		<p>
			{data.detail.entry.setCode.toUpperCase()} · {data.detail.entry.finish} · {data.detail.entry
				.condition}
		</p>
		<form
			onsubmit={saveDemo}
			method="POST"
			action={data.returnTo + (data.returnTo.includes('?') ? '&' : '?') + '/updateQuantity'}
		>
			<input type="hidden" name="requestId" value={data.requestIds.notes} />
			<input type="hidden" name="entryId" value={data.detail.entry.id} />
			<input type="hidden" name="notesRevision" value={data.detail.entry.notesRevision} /><input
				type="hidden"
				name="notesOriginal"
				value={data.detail.entry.notes}
			/><input type="hidden" name="quantityBase" value={data.detail.entry.quantity} />
			<label for="entry-quantity">{language.t('ui.Owned.quantity')}</label><input
				class="input"
				id="entry-quantity"
				name="quantity"
				type="number"
				min="1"
				step="1"
				required
				value={data.detail.entry.quantity}
			/>
			<label for="entry-notes">{language.t('ui.Notes')}</label><textarea
				class="input"
				id="entry-notes"
				name="notes"
				maxlength="4000">{data.detail.entry.notes}</textarea
			>
			<button disabled={pending} class="btn btn-primary">{language.t('ui.Save')}</button>
		</form>
		<h2>{language.t('ui.Boxes')}</h2>
		<form
			onsubmit={saveDemo}
			method="POST"
			action={data.returnTo + (data.returnTo.includes('?') ? '&' : '?') + '/assignGroups'}
		>
			<input type="hidden" name="requestId" value={data.requestIds.groups} /><input
				type="hidden"
				name="entryId"
				value={data.detail.entry.id}
			/>
			{#each data.groups as group}<label>
					<input
						type="checkbox"
						name="groupId"
						value={group.id}
						checked={data.detail.memberships.includes(group.id)}
					/>{group.name}
				</label>{/each}
			<button disabled={pending} class="btn btn-primary">{language.t('ui.Save.boxes')}</button>
		</form>
		<h2>{language.t('ui.Remove.this.entry')}</h2>
		<p>
			{language.t(
				'sentence.Remove.all.p0.copies.of.this.printing.finish.and.condition.This.cannot.be.undone',
				{ p0: String(data.detail.entry.quantity) }
			)}
		</p>
		<form
			onsubmit={saveDemo}
			method="POST"
			action={data.returnTo + (data.returnTo.includes('?') ? '&' : '?') + '/remove'}
		>
			<input type="hidden" name="requestId" value={data.requestIds.remove} /><input
				type="hidden"
				name="entryId"
				value={data.detail.entry.id}
			/><input type="hidden" name="expectedQuantity" value={data.detail.entry.quantity} />
			<button disabled={pending} class="btn btn-secondary">
				{language.t('sentence.Remove.all.p0.copies', {
					p0: String(data.detail.entry.quantity)
				})}
			</button>
		</form>
		{#if saveError}<p role="alert">{language.t(saveError)}</p>{/if}
	</div>{/if}
