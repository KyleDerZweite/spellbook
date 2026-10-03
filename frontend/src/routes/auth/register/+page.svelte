<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let pending = $state(false);
</script>

<svelte:head
	><title>Create an account | Spellbook</title><meta name="robots" content="noindex" /></svelte:head
>

<section class="mx-auto flex min-h-[65vh] max-w-md flex-col justify-center px-6 py-12">
	<h1 class="mb-6 font-display text-xl font-semibold text-gold-bright">Create an account</h1>
	<form
		method="POST"
		class="space-y-5"
		use:enhance={() => {
			pending = true;
			return async ({ update }) => {
				try {
					await update();
				} finally {
					pending = false;
				}
			};
		}}
	>
		{#if form?.message}<p
				role="alert"
				class="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm"
			>
				{form.message}
			</p>{/if}
		<div>
			<label for="username" class="label">Username</label>
			<input
				id="username"
				name="username"
				autocomplete="username"
				required
				minlength="3"
				maxlength="32"
				value={form?.username ?? ''}
				aria-describedby="username-help"
				class="input w-full"
			/>
			<p id="username-help" class="mt-2 text-xs text-[var(--color-text-secondary)]">
				3 to 32 letters, numbers, underscores or hyphens. Start with a letter or number.
			</p>
		</div>
		<div>
			<label for="password" class="label">Password</label>
			<input
				id="password"
				name="password"
				type="password"
				autocomplete="new-password"
				required
				minlength="12"
				maxlength="128"
				aria-describedby="password-help"
				class="input w-full"
			/>
			<p id="password-help" class="mt-2 text-xs text-[var(--color-text-secondary)]">
				Use 12 to 128 characters.
			</p>
		</div>
		<button type="submit" disabled={pending} class="btn btn-primary w-full disabled:opacity-50"
			>{pending ? 'Please wait...' : 'Create an account'}</button
		>
	</form>
	<a
		class="mt-6 text-center text-sm underline underline-offset-4"
		href={`/auth/login?returnTo=${encodeURIComponent(data.returnTo)}`}>Sign in to your account</a
	>
</section>
