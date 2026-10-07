<script lang="ts">
	import { savedProfile } from '#lib/saved-state/profile.svelte.ts';
	import { enhance } from '$app/forms';
	import { onMount, untrack, tick } from 'svelte';
	import ProfileCard from '#lib/components/profile/ProfileCard.svelte';
	import ProfileCardEditor from '#lib/components/profile/ProfileCardEditor.svelte';
	import { isProfileArtworkId, getProfileArtwork } from '#lib/profile/artwork.ts';
	import {
		validateProfileCard,
		PROFILE_CARD_FRAMES,
		PROFILE_CARD_RARITIES,
		type ProfileCardErrors
	} from '#lib/profile/card.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	$effect(() => {
		savedProfile.seed(data);
	});
	let saved = $derived(
		savedProfile.profile?.user.accountId === data.user.accountId ? savedProfile.profile : data
	);
	let initialArtwork = $derived(
		getProfileArtwork(form && 'artworkId' in form ? form.artworkId : data.user.artworkId)
			.id as string
	);
	let rejectedCard = $derived(form && 'card' in form ? form.card : undefined);
	let incomingCard = $derived({
		...data.card,
		...(rejectedCard
			? {
					name: rejectedCard.name,
					manaCost: rejectedCard.manaCost,
					typeLine: rejectedCard.typeLine,
					rulesText: rejectedCard.rulesText,
					flavorText: rejectedCard.flavorText,
					power: rejectedCard.power,
					toughness: rejectedCard.toughness,
					legendary: rejectedCard.legendary,
					frame:
						PROFILE_CARD_FRAMES.find((f) => f.value === rejectedCard.frame)?.value ??
						data.card.frame,
					rarity:
						PROFILE_CARD_RARITIES.find((r) => r.value === rejectedCard.rarity)?.value ??
						data.card.rarity
				}
			: {})
	});
	let card = $state(untrack(() => incomingCard));
	let selectedArtwork = $state(untrack(() => initialArtwork));
	let baselineCard = $state(untrack(() => ({ ...data.card })));
	let baselineArtwork = $state(untrack(() => data.user.artworkId));
	let previousIncoming = untrack(() => incomingCard);
	$effect(() => {
		const incoming = incomingCard;
		if (incoming !== previousIncoming) {
			card = { ...incoming };
			selectedArtwork = initialArtwork;
			baselineCard = { ...data.card };
			baselineArtwork = data.user.artworkId;
			previousIncoming = incoming;
		}
	});
	$effect(() => {
		const next = saved;
		untrack(() => {
			const merged = { ...card };
			const baseline = { ...baselineCard };
			for (const field of Object.keys(next.card) as (keyof typeof card)[]) {
				if (card[field] === baselineCard[field]) {
					Object.assign(merged, { [field]: next.card[field] });
					Object.assign(baseline, { [field]: next.card[field] });
				}
			}
			card = merged;
			baselineCard = baseline;
			if (selectedArtwork === baselineArtwork) {
				selectedArtwork = getProfileArtwork(next.user.artworkId).id;
				baselineArtwork = next.user.artworkId;
			}
		});
	});
	let errors: ProfileCardErrors = $derived(
		form && 'errors' in form
			? Object.fromEntries(
					Object.entries(form.errors ?? {}).filter(
						([field]) =>
							!rejectedCard ||
							card[field as keyof typeof card] === rejectedCard[field as keyof typeof rejectedCard]
					)
				)
			: {}
	);
	let pending = $state(false);
	let saveError = $state('');
	let preview: HTMLDivElement;
	let previewHeight = $state(0);
	let viewportHeight = $state(0);
	let canStick = $derived(previewHeight > 0 && previewHeight < viewportHeight - 140);
	let isSaved = $derived(
		selectedArtwork === saved.user.artworkId && JSON.stringify(card) === JSON.stringify(saved.card)
	);

	onMount(() => {
		const measure = () => {
			previewHeight = preview.getBoundingClientRect().height;
			viewportHeight = window.innerHeight;
		};
		const observer = new ResizeObserver(measure);
		observer.observe(preview);
		window.addEventListener('resize', measure);
		measure();
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', measure);
		};
	});
</script>

<svelte:head
	><title>Profile Card | Spellbook</title><meta
		name="robots"
		content="noindex, nofollow"
	/></svelte:head
>

<div class="settings-page">
	{#if savedProfile.status !== 'live' && savedProfile.status !== 'idle'}<p
			role="status"
			class="text-sm text-text-secondary"
		>
			Saved changes synchronization is {savedProfile.status}.
		</p>{/if}
	<div class="page-title"><h1>Profile Card</h1></div>
	<div class="settings-profile">
		<div bind:this={preview} class="settings-preview" class:sticky-preview={canStick}>
			<ProfileCard
				username={saved.user.username}
				avatarId={saved.user.avatarId}
				artworkId={selectedArtwork}
				totals={saved.totals}
				definition={card}
			/>
			<p class="preview-status">Private profile card · {isSaved ? 'Saved' : 'Unsaved changes'}</p>
			{#if saved.statsError}<p role="status" class="text-sm text-text-secondary">
					{saved.statsError}
				</p>{/if}
		</div>
		<form
			method="POST"
			aria-busy={pending}
			aria-describedby="profile-status"
			use:enhance={({ formData }) => {
				formData.set('partial', 'true');
				for (const field of Object.keys(data.card) as (keyof typeof data.card)[]) {
					if (card[field] === baselineCard[field]) formData.delete(field);
					else if (field === 'legendary') formData.set(field, card.legendary ? 'on' : 'off');
				}
				if (selectedArtwork === baselineArtwork) formData.delete('artworkId');
				const submittedCard = { ...card };
				const submittedArtwork = selectedArtwork;
				const submittedFields = new Set(formData.keys());
				const write = savedProfile.beginWrite();
				pending = true;
				saveError = '';
				return async ({ result, update }) => {
					try {
						if (write && !write.current()) return;
						if (result.type === 'error') saveError = 'Could not save your card. Try again.';
						else {
							await update({ reset: false, refreshAll: false, navigate: false });
							if (write && !write.current()) return;
							if (result.type === 'success' && result.data?.savedCard) {
								const value = result.data.savedCard;
								if (typeof value !== 'object' || !('card' in value) || !('artworkId' in value))
									return;
								const validated = validateProfileCard(value.card);
								if (!validated.success || !isProfileArtworkId(value.artworkId)) return;
								const acknowledged = { card: validated.value, artworkId: value.artworkId };
								for (const field of Object.keys(acknowledged.card) as (keyof typeof card)[]) {
									if (!submittedFields.has(field)) continue;
									Object.assign(baselineCard, { [field]: acknowledged.card[field] });
									if (card[field] === submittedCard[field])
										Object.assign(card, { [field]: acknowledged.card[field] });
								}
								if (submittedFields.has('artworkId')) {
									baselineArtwork = acknowledged.artworkId;
									if (selectedArtwork === submittedArtwork)
										selectedArtwork = acknowledged.artworkId;
								}
							}
							if (result.type === 'failure') {
								pending = false;
								await tick();
								if (write && !write.current()) return;
								document
									.querySelector<HTMLElement>('.settings-page [aria-invalid="true"]')
									?.focus();
							}
						}
					} finally {
						write?.complete();
						pending = false;
					}
				};
			}}
		>
			<input type="hidden" name="baselineCard" value={JSON.stringify(baselineCard)} />
			<input type="hidden" name="baselineArtworkId" value={baselineArtwork} />
			<ProfileCardEditor
				bind:card
				bind:artworkId={selectedArtwork}
				disabled={pending}
				{errors}
				totals={saved.totals}
			/>
			<div class="settings-save">
				<button class="btn btn-primary" disabled={pending}
					>{pending ? 'Saving...' : 'Save card'}</button
				>
				<div
					id="profile-status"
					aria-live="polite"
					aria-atomic="true"
					class="text-sm text-text-secondary"
				>
					{#if saveError}<span class="text-error">{saveError}</span
						>{:else if form?.message && (!form.success || isSaved)}<span
							class:text-error={!form.success}>{form.message}</span
						>{/if}
				</div>
			</div>
		</form>
	</div>
</div>

<style>
	.settings-page {
		min-width: 0;
	}
	.settings-profile {
		display: grid;
		grid-template-columns: minmax(260px, 340px) minmax(0, 520px);
		gap: 2rem;
		justify-content: center;
		align-items: start;
		margin-top: 1.5rem;
	}
	.settings-preview {
		min-width: 0;
	}
	.sticky-preview {
		position: sticky;
		top: 16px;
	}
	.settings-preview > p {
		max-width: 340px;
		margin-top: 0.75rem;
	}
	.preview-status {
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		text-align: center;
	}
	.settings-page form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		min-width: 0;
	}
	.settings-save {
		display: flex;
		align-items: center;
		gap: 1rem;
		min-height: 44px;
	}
	@media (max-width: 900px) {
		.settings-page {
			max-width: 560px;
			margin-inline: auto;
		}
		.settings-profile {
			grid-template-columns: minmax(0, 1fr);
			gap: 1.75rem;
		}
		.settings-preview {
			display: flex;
			flex-direction: column;
			align-items: center;
			position: static;
			width: min(100%, 340px);
			margin-inline: auto;
		}
		.settings-save {
			flex-wrap: wrap;
		}
	}
</style>
