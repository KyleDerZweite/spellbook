<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let pending = $state(false);
</script>

<svelte:head><title>Sign in | Spellbook</title><meta name="robots" content="noindex" /></svelte:head
>

<div class="account-layout">
	<section class="account-form">
		<h1 class="mb-6 font-display text-xl font-semibold text-text-primary">Sign in to Spellbook</h1>
		{#if data.demoMode}<p class="mb-5 text-sm text-text-secondary">
				Demo mode. Sign in with <strong>demo</strong> / <strong>demo</strong>.
			</p>{/if}
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
					class="input w-full"
				/>
			</div>
			<div>
				<label for="password" class="label">Password</label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="current-password"
					required
					minlength={data.demoMode ? 4 : 12}
					maxlength="128"
					class="input w-full"
				/>
			</div>
			<button type="submit" disabled={pending} class="btn btn-primary w-full disabled:opacity-50"
				>{pending ? 'Please wait...' : 'Sign in'}</button
			>
		</form>
		{#if !data.demoMode}<p class="auth-switch">
				New to Spellbook? <a href={`/auth/register?returnTo=${encodeURIComponent(data.returnTo)}`}
					>Sign up</a
				>
			</p>{/if}
	</section>
</div>
