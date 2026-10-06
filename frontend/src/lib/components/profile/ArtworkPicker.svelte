<script lang="ts">
	import { PROFILE_ARTWORK, DEFAULT_ARTWORK_ID } from '#lib/profile/artwork.ts';

	let {
		selected = $bindable(DEFAULT_ARTWORK_ID as string),
		disabled = false,
		compact = false
	}: { selected?: string; disabled?: boolean; compact?: boolean } = $props();
</script>

<fieldset class="artwork-picker" class:compact {disabled}>
	<legend class="label">Artwork</legend>
	<div class="artwork-options">
		{#each PROFILE_ARTWORK as artwork (artwork.id)}
			<label class="artwork-choice">
				<input type="radio" name="artworkId" value={artwork.id} bind:group={selected} />
				<span class="artwork-option">
					<img
						src={artwork.src.replace('.webp', '-thumb.webp')}
						srcset={`${artwork.src.replace('.webp', '-thumb.webp')} 320w, ${artwork.src} 960w`}
						sizes="(max-width: 600px) 45vw, 260px"
						alt=""
						width="320"
						height="213"
						loading="lazy"
					/>
					<span class="artwork-label">{artwork.label}</span>
					<svg
						class="artwork-check"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg
					>
				</span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.artwork-picker {
		min-width: 0;
	}
	.artwork-options {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}
	.artwork-choice {
		position: relative;
		min-width: 0;
		cursor: pointer;
	}
	.artwork-choice input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.artwork-option {
		display: block;
		position: relative;
		overflow: hidden;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-stone);
	}
	.artwork-option img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 3 / 2;
		object-fit: contain;
	}
	.artwork-label {
		display: block;
		padding: 0.5rem 0.65rem;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}
	.artwork-check {
		position: absolute;
		right: 0.5rem;
		bottom: 0.5rem;
		visibility: hidden;
		color: var(--color-text-primary);
	}
	.artwork-choice input:checked + .artwork-option {
		border-color: var(--color-text-primary);
	}
	.artwork-choice input:checked + .artwork-option .artwork-label {
		color: var(--color-text-primary);
	}
	.artwork-choice input:checked + .artwork-option .artwork-check {
		visibility: visible;
	}
	.artwork-choice input:focus-visible + .artwork-option {
		outline: 2px solid var(--color-text-primary);
		outline-offset: 3px;
	}
	.artwork-choice input:disabled + .artwork-option {
		opacity: 0.6;
		cursor: wait;
	}
	.compact .artwork-options {
		gap: 0.5rem;
	}
</style>
