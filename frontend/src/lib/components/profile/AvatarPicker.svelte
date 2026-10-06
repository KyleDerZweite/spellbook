<script lang="ts">
	import Avatar from './Avatar.svelte';
	import { AVATARS, DEFAULT_AVATAR_ID } from '#lib/profile/avatars.ts';

	let {
		selected = $bindable(DEFAULT_AVATAR_ID as string),
		disabled = false
	}: {
		selected?: string;
		disabled?: boolean;
	} = $props();
</script>

<fieldset {disabled}>
	<legend class="label">Avatar</legend>
	<div class="avatar-choices">
		{#each AVATARS as avatar (avatar.id)}
			<label class="avatar-choice">
				<input type="radio" name="avatarId" value={avatar.id} bind:group={selected} />
				<span class="avatar-option"
					><Avatar id={avatar.id} size={32} /><span>{avatar.label}</span>
					<svg
						class="avatar-check"
						width="10"
						height="10"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg
					></span
				>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.avatar-choices {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 0.5rem;
	}
	.avatar-choice {
		position: relative;
		min-width: 0;
		cursor: pointer;
	}
	.avatar-choice input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.avatar-check {
		position: absolute;
		top: 0.3rem;
		right: 0.3rem;
		visibility: hidden;
	}
	.avatar-choice input:checked + .avatar-option .avatar-check {
		visibility: visible;
	}
	.avatar-option {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		min-height: 64px;
		padding: 0.5rem 0.15rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		color: var(--color-text-secondary);
		font-size: 0.625rem;
	}
	.avatar-choice:hover .avatar-option {
		background: var(--color-stone);
	}
	.avatar-choice input:checked + .avatar-option {
		color: var(--color-text-primary);
		border-color: var(--color-text-primary);
		background: var(--color-stone);
	}
	.avatar-choice input:focus-visible + .avatar-option {
		outline: 2px solid var(--color-text-primary);
		outline-offset: 3px;
	}
	.avatar-choice input:disabled + .avatar-option {
		cursor: wait;
		opacity: 0.6;
	}
	@media (max-width: 450px) {
		.avatar-choices {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
