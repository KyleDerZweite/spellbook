<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.detail.entry.name} | Inventory | Spellbook</title></svelte:head>
<div class="workspace-container">
	<a href={data.returnTo}>Back to Inventory</a>
	<h1>{data.detail.entry.name}</h1>
	<p>
		{data.detail.entry.setCode.toUpperCase()} · {data.detail.entry.finish} · {data.detail.entry
			.condition}
	</p>
	<form
		method="POST"
		action={data.returnTo + (data.returnTo.includes('?') ? '&' : '?') + '/updateQuantity'}
	>
		<input type="hidden" name="requestId" value={data.requestId} />
		<input type="hidden" name="entryId" value={data.detail.entry.id} />
		<input type="hidden" name="notesRevision" value={data.detail.entry.notesRevision} />
		<label for="entry-quantity">Owned quantity</label><input
			class="input"
			id="entry-quantity"
			name="quantity"
			type="number"
			min="1"
			step="1"
			required
			value={data.detail.entry.quantity}
		/>
		<label for="entry-notes">Notes</label><textarea
			class="input"
			id="entry-notes"
			name="notes"
			maxlength="4000">{data.detail.entry.notes}</textarea
		>
		<button class="btn btn-primary">Save</button>
	</form>
	<h2>Groups</h2>
	<form
		method="POST"
		action={data.returnTo + (data.returnTo.includes('?') ? '&' : '?') + '/assignGroups'}
	>
		<input type="hidden" name="requestId" value={data.requestId} /><input
			type="hidden"
			name="entryId"
			value={data.detail.entry.id}
		/>
		{#each data.groups as group}<label
				><input
					type="checkbox"
					name="groupId"
					value={group.id}
					checked={data.detail.memberships.includes(group.id)}
				/>{group.name}</label
			>{/each}
		<button class="btn btn-primary">Save groups</button>
	</form>
	<h2>Remove this entry</h2>
	<p>
		Remove all {data.detail.entry.quantity} copies of this printing, finish and condition. This cannot
		be undone.
	</p>
	<form
		method="POST"
		action={data.returnTo + (data.returnTo.includes('?') ? '&' : '?') + '/remove'}
	>
		<input type="hidden" name="requestId" value={data.requestId} /><input
			type="hidden"
			name="entryId"
			value={data.detail.entry.id}
		/><input type="hidden" name="expectedQuantity" value={data.detail.entry.quantity} />
		<button class="btn btn-secondary">Remove all {data.detail.entry.quantity} copies</button>
	</form>
</div>
