<script lang="ts">
	import { savedProfile } from '#lib/saved-state/profile.svelte.ts';
	import { enhance } from '$app/forms';
	import { Dialog } from 'bits-ui';
	import { tick, untrack } from 'svelte';
	import AvatarPicker from './AvatarPicker.svelte';
	import { getAvatar } from '#lib/profile/avatars.ts';
	let { avatarId }: { avatarId?: string } = $props();
	let open = $state(false);
	let selected = $state('wizard');
	let lastSavedAvatar = $state(untrack(() => getAvatar(avatarId).id));
	$effect(() => {
		const next = getAvatar(avatarId).id;
		if (open && selected === lastSavedAvatar) selected = next;
		lastSavedAvatar = next;
	});
	let pending = $state(false);
	let message = $state('');
	let content = $state<HTMLDivElement | null>(null);
	let trigger = $state<HTMLButtonElement | null>(null);
	function changeOpen(next: boolean) {
		if (pending) return;
		if (next) {
			selected = getAvatar(avatarId).id;
			message = '';
		}
		open = next;
	}
</script>

<Dialog.Root bind:open={() => open, changeOpen}>
	<Dialog.Trigger bind:ref={trigger} class="btn btn-secondary">Edit avatar</Dialog.Trigger>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/70" />
		<Dialog.Content
			bind:ref={content}
			onCloseAutoFocus={(event) => {
				if (trigger?.isConnected) {
					event.preventDefault();
					void tick().then(() => trigger?.focus({ preventScroll: true }));
				}
			}}
			class="avatar-dialog fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-mist bg-crypt p-6 text-text-primary shadow-2xl"
			onOpenAutoFocus={(event) => {
				event.preventDefault();
				content?.querySelector<HTMLInputElement>('input:checked')?.focus();
			}}
		>
			<Dialog.Title class="mb-5 text-xl font-display">Edit avatar</Dialog.Title>
			<Dialog.Description class="sr-only">Choose a sprite for your account.</Dialog.Description>
			<form
				method="POST"
				action="/settings"
				aria-busy={pending}
				use:enhance={() => {
					const write = savedProfile.beginWrite();
					const submitted = selected;
					pending = true;
					message = '';
					return async ({ result, update }) => {
						try {
							if (write && !write.current()) return;
							if (result.type === 'success') {
								await update({ reset: false, refreshAll: false, navigate: false });
								if (write && !write.current()) return;
								lastSavedAvatar = getAvatar(submitted).id;
								if (selected === submitted) open = false;
							} else
								message =
									result.type === 'failure' && result.data?.message
										? String(result.data.message)
										: 'Could not save your avatar. Try again.';
						} finally {
							write?.complete();
							if (!write || write.current()) pending = false;
						}
					};
				}}
			>
				<input type="hidden" name="intent" value="avatar" />
				<AvatarPicker bind:selected disabled={pending} />
				<p role="alert" class="mt-3 text-sm text-error">{message}</p>
				<div class="mt-5 flex flex-wrap justify-end gap-3">
					<Dialog.Close type="button" class="btn btn-secondary" disabled={pending}
						>Cancel</Dialog.Close
					>
					<button class="btn btn-primary" disabled={pending}
						>{pending ? 'Saving...' : 'Save avatar'}</button
					>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
