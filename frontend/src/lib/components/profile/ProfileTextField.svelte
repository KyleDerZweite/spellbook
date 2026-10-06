<script lang="ts">
	import { tick } from 'svelte';
	import KpiInsert from './KpiInsert.svelte';
	import {
		PROFILE_CARD_LINE_LIMITS,
		insertProfileKpi,
		type ProfileKpiKey,
		type ProfileTemplateField
	} from '#lib/profile/card.ts';
	import type { ProfileTotals } from '#lib/profile/types.ts';
	let {
		name,
		label,
		value = $bindable(''),
		multiline = false,
		rows = 3,
		limit,
		disabled = false,
		error,
		help,
		totals
	}: {
		name: ProfileTemplateField;
		label: string;
		value?: string;
		multiline?: boolean;
		rows?: number;
		limit: number;
		disabled?: boolean;
		error?: string;
		help?: string;
		totals: ProfileTotals | null;
	} = $props();
	let insertError = $state('');
	let lineLimit = $derived(
		name === 'rulesText' || name === 'flavorText' ? PROFILE_CARD_LINE_LIMITS[name] : null
	);
	let limitError = $derived(
		value.length > limit
			? `Use at most ${limit} characters.`
			: lineLimit && value.split('\n').length > lineLimit
				? `Use at most ${lineLimit} lines.`
				: undefined
	);
	let input = $state<HTMLInputElement | HTMLTextAreaElement>();
	async function insert(key: ProfileKpiKey) {
		if (!input) return;
		const result = insertProfileKpi(
			value,
			multiline ? (input.selectionStart ?? value.length) : 0,
			multiline ? (input.selectionEnd ?? value.length) : value.length,
			key
		);
		if (result.text.length > limit) {
			insertError = `Not enough space for this KPI. The limit is ${limit} characters.`;
			await tick();
			input.focus();
			return;
		}
		insertError = '';
		value = result.text;
		await tick();
		input.focus();
		input.setSelectionRange(result.caret, result.caret);
	}
</script>

<div class="profile-field">
	<div class="field-label">
		<label class="label" for={`card-${name}`}>{label}</label><KpiInsert
			fieldLabel={label}
			{totals}
			{disabled}
			onInsert={insert}
		/>
	</div>
	{#if multiline}<textarea
			bind:this={input}
			id={`card-${name}`}
			{name}
			bind:value
			class="input"
			{rows}
			maxlength={limit}
			{disabled}
			oninput={() => {
				insertError = '';
			}}
			aria-invalid={!!(error || limitError || insertError)}
			aria-describedby={`card-${name}-help card-${name}-error`}></textarea>
	{:else}<input
			bind:this={input}
			id={`card-${name}`}
			{name}
			bind:value
			class="input"
			maxlength={limit}
			{disabled}
			oninput={() => {
				insertError = '';
			}}
			aria-invalid={!!(error || limitError || insertError)}
			aria-describedby={`card-${name}-help card-${name}-error`}
		/>{/if}
	<div class="field-guidance">
		<p id={`card-${name}-help`} class="field-help">
			{#if help}{help}{:else}Optional · supports live KPIs{/if}{#if lineLimit}
				Up to {lineLimit} lines.{/if}
		</p>
		<span class="field-count">{value.length}/{limit}</span>
	</div>
	<p id={`card-${name}-error`} class="field-error">
		{error || limitError || insertError}
	</p>
</div>

<style>
	.profile-field {
		min-width: 0;
	}
	.field-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.4rem;
	}
	.field-label .label {
		margin: 0;
	}
	textarea {
		resize: vertical;
		min-height: 4.5rem;
	}
	.field-guidance {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		align-items: baseline;
	}
	.field-count {
		flex-shrink: 0;
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		font-variant-numeric: tabular-nums;
	}
	.field-help {
		margin: 0.35rem 0 0;
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		line-height: 1.5;
	}
	.field-error {
		margin: 0.3rem 0 0;
		color: var(--color-error);
		font-size: 0.75rem;
	}
	.field-error:empty {
		display: none;
	}
</style>
