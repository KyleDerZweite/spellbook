<script lang="ts">
	import { goto } from '$app/navigation';
	import { untrack, onDestroy } from 'svelte';
	import { createScanSave } from '#lib/scan/save.ts';
	import Select from '#lib/components/ui/select/Select.svelte';
	import type { CardDocument } from '#lib/search/types.ts';
	import type { ScanCandidate, ScanSession, ScanSessionResult } from '@spellbook/contracts/scan.ts';

	let {
		sessions,
		initialResult
	}: { sessions: ScanSession[]; initialResult: ScanSessionResult | null } = $props();
	let result = $state(untrack(() => initialResult));
	let busy = $state(false);
	let searching = $state(false);
	let message = $state('');
	let failure = $state('');
	let query = $state('');
	let hits = $state<CardDocument[]>([]);
	let searched = $state(false);
	let printings = $state<CardDocument[]>([]);
	let printingCount = $state(0);
	let selected = $state<ScanCandidate | null>(untrack(() => initialResult?.reviewItems[0] ?? null));
	let quantity = $state(untrack(() => initialResult?.reviewItems[0]?.quantity ?? 1));
	let finish = $state(untrack(() => initialResult?.reviewItems[0]?.finish ?? 'nonfoil'));
	let condition = $state(untrack(() => initialResult?.reviewItems[0]?.condition ?? 'NM'));
	let confirmed = $state(false);
	let files = $state<FileList>();
	let sessionInput = $state(untrack(() => initialResult?.session?.id ?? ''));
	let searchGeneration = 0;
	let pendingCommit: { key: string; body: string } | null = null;
	let readFailure = $state('');
	let mounted = true;
	let readGeneration = 0;
	let committedDraftKey: string | null = null;
	onDestroy(() => {
		mounted = false;
		readGeneration++;
	});
	const saved = createScanSave({
		commit: (body) =>
			request<import('@spellbook/contracts/scan.ts').ScanCommitAcknowledgement>(
				`${api}/scan/review/commit`,
				{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
			),
		read: (id) => request<ScanSessionResult>(`${api}/scan/sessions/${id}/result`)
	});
	const conditions = [
		['NM', 'Near mint'],
		['LP', 'Lightly played'],
		['MP', 'Moderately played'],
		['HP', 'Heavily played'],
		['DMG', 'Damaged']
	];
	const session = $derived(result?.session);
	const artifact = $derived(result?.lastResult ? { id: result.lastResult.artifactId } : undefined);
	const candidates = $derived(result?.lastResult?.candidates ?? []);
	const editable = $derived(session?.status === 'open' || session?.status === 'pending_review');
	const selectedPrinting = $derived(printings.find((card) => card.id === selected?.catalogCardId));
	const validQuantity = $derived(
		Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 2147483647
	);

	async function request<T>(path: string, init?: RequestInit): Promise<T> {
		const response = await fetch(path, init);
		if (!response.ok) {
			const body = await response.json().catch(() => null);
			throw new Error(body?.message ?? `Request failed (${response.status}). Try again.`);
		}
		return response.json();
	}

	function report(cause: unknown) {
		failure = cause instanceof Error ? cause.message : 'The request failed. Try again.';
	}

	async function openSession(id: string) {
		if (!id) return;
		busy = true;
		failure = '';
		try {
			await goto(`/mtg/scan?session=${encodeURIComponent(id)}`);
		} catch (cause) {
			report(cause);
		} finally {
			busy = false;
		}
	}

	async function createSession() {
		busy = true;
		failure = '';
		try {
			const created = await request<{ session: ScanSession }>(`${api}/scan/sessions`, {
				method: 'POST'
			});
			await openSession(created.session.id);
		} catch (cause) {
			report(cause);
		} finally {
			busy = false;
		}
	}

	function draftKey() {
		return JSON.stringify({
			sessionId: session?.id,
			artifactId: artifact?.id,
			printingId: selected?.catalogCardId,
			quantity,
			finish,
			condition
		});
	}
	async function readCurrent() {
		if (!session) return;
		const id = session.id,
			generation = ++readGeneration;
		try {
			const current =
				saved.acknowledgement?.kind === 'Committed'
					? await saved.read()
					: await request<ScanSessionResult>(`${api}/scan/sessions/${id}/result`);
			if (!mounted || generation !== readGeneration || session?.id !== id) return;
			const reconcile = committedDraftKey !== null && draftKey() === committedDraftKey;
			result = current;
			readFailure = '';
			if (reconcile) {
				const review =
					current.reviewItems.find((item) => item.scanArtifactId === artifact?.id) ??
					current.reviewItems[0];
				if (review) {
					selected = review;
					quantity = review.quantity;
					finish = review.finish;
					condition = review.condition;
				}
			}
		} catch (cause) {
			if (mounted && generation === readGeneration && session?.id === id) {
				if (saved.acknowledgement?.kind === 'Committed')
					readFailure =
						'The scan was saved, but its current details could not be loaded. Retry the read.';
				else report(cause);
			}
		}
	}
	async function refresh() {
		busy = true;
		failure = '';
		try {
			await readCurrent();
		} finally {
			if (mounted) busy = false;
		}
	}

	async function upload() {
		const file = files?.[0];
		if (!session || !file) return;
		failure = '';
		message = '';
		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size) {
			failure = 'Choose a nonempty JPEG, PNG, or WebP photo.';
			return;
		}
		busy = true;
		try {
			const form = new FormData();
			form.set('file', file);
			await request(`${api}/scan/sessions/${session.id}/frames`, { method: 'POST', body: form });
			result = await request<ScanSessionResult>(`${api}/scan/sessions/${session.id}/result`);
			message = 'Photo uploaded. Review the printing before adding it to inventory.';
		} catch (cause) {
			report(cause);
		} finally {
			busy = false;
		}
	}

	async function search() {
		if (query.trim().length < 2) return;
		const generation = ++searchGeneration;
		searching = true;
		failure = '';
		hits = [];
		try {
			const response = await request<{ hits: CardDocument[] }>(
				`${api}/search?q=${encodeURIComponent(query.trim())}&limit=20`
			);
			if (generation === searchGeneration) {
				hits = response.hits;
				searched = true;
			}
		} catch (cause) {
			if (generation === searchGeneration) report(cause);
		} finally {
			if (generation === searchGeneration) searching = false;
		}
	}

	function choosePrinting(card: CardDocument) {
		const candidate = candidates.find((entry) => entry.catalogCardId === card.id);
		selected = {
			catalogCardId: card.id,
			canonicalCardId: card.oracle_id,
			oracleId: card.oracle_id,
			name: card.name,
			setCode: card.set_code,
			collectorNumber: card.collector_number,
			imageUri: card.image_uri_small || card.image_uri,
			similarityScore: candidate?.similarityScore ?? 0,
			ocrScore: candidate?.ocrScore ?? 0,
			finalScore: candidate?.finalScore ?? 0,
			matchReason: candidate?.matchReason ?? 'manual_review'
		};
		if (finish === 'foil' && !card.is_foil_available) finish = 'nonfoil';
		if (finish === 'nonfoil' && !card.is_nonfoil_available && card.is_foil_available)
			finish = 'foil';
		confirmed = false;
	}

	async function chooseCard(oracleId: string, preferredId?: string) {
		const generation = ++searchGeneration;
		searching = true;
		failure = '';
		confirmed = false;
		try {
			const response = await request<{ hits: CardDocument[]; estimatedTotalHits: number }>(
				`${api}/cards/${encodeURIComponent(oracleId)}/printings`
			);
			if (generation !== searchGeneration) return;
			printings = response.hits;
			printingCount = response.estimatedTotalHits;
			const choice = printings.find((card) => card.id === preferredId) ?? printings[0];
			if (!choice) {
				failure = 'No printings found for this card.';
				return;
			}
			choosePrinting(choice);
			hits = [];
			searched = false;
		} catch (cause) {
			if (generation === searchGeneration) report(cause);
		} finally {
			if (generation === searchGeneration) searching = false;
		}
	}

	async function morePrintings() {
		if (!selected) return;
		searching = true;
		failure = '';
		try {
			const response = await request<{ hits: CardDocument[]; estimatedTotalHits: number }>(
				`${api}/cards/${encodeURIComponent(selected.oracleId)}/printings?limit=100&offset=${printings.length}`
			);
			printings = [...printings, ...response.hits];
			printingCount = response.hits.length ? response.estimatedTotalHits : printings.length;
		} catch (cause) {
			report(cause);
		} finally {
			searching = false;
		}
	}

	async function commit() {
		if (!confirmed || !selected || !session || !artifact || !validQuantity || !editable) return;
		busy = true;
		failure = '';
		message = '';
		try {
			const intent = {
				sessionId: session.id,
				items: [
					{
						scanArtifactId: artifact.id,
						catalogCardId: selected.catalogCardId,
						quantity,
						finish,
						condition
					}
				]
			};
			const key = JSON.stringify(intent);
			if (!pendingCommit || pendingCommit.key !== key)
				pendingCommit = {
					key,
					body: JSON.stringify({ requestId: `scan-review:${crypto.randomUUID()}`, ...intent })
				};
			const attemptedDraftKey = draftKey(),
				attemptedQuantity = quantity,
				attemptedName = selected.name;
			const acknowledged = await saved.commit(pendingCommit.body);
			if (!mounted) return;
			if (acknowledged.kind !== 'Committed') {
				message =
					'This earlier request will not be applied again. Reload its saved session to check the result.';
				return;
			}
			pendingCommit = null;
			committedDraftKey = attemptedDraftKey;
			result = { ...result!, session: { ...session, status: 'committed' } };
			confirmed = false;
			message = `Added ${attemptedQuantity} ${attemptedQuantity === 1 ? 'copy' : 'copies'} of ${attemptedName} to inventory.`;
			await readCurrent();
		} catch (cause) {
			if (mounted) report(cause);
		} finally {
			if (mounted) busy = false;
		}
	}
</script>

<div class="workspace-container space-y-5 text-sm">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="page-title">
			<h1>Scan</h1>
		</div>
		<button class="btn btn-primary" disabled={busy} onclick={createSession}>New scan</button>
	</div>

	{#if failure}<p role="alert" class="rounded border border-error p-3 text-text-primary">
			{failure}
		</p>{/if}
	<p role="status" class:sr-only={!message}>{message}</p>
	{#if readFailure}<div role="alert" class="space-y-2">
			<p>{readFailure}</p>
			<button class="btn btn-secondary" disabled={busy} onclick={refresh}
				>Retry saved scan details</button
			>
		</div>{/if}
	{#if !session}
		<p class="text-text-secondary">Start a scan to upload and review a card photo.</p>
	{:else}
		<div class="flex flex-wrap items-center gap-3 text-text-secondary">
			<span>{session.status.replaceAll('_', ' ')}</span>
		</div>
		{#if session.status === 'open'}
			<form
				class="surface-card space-y-3 p-4"
				onsubmit={(event) => {
					event.preventDefault();
					upload();
				}}
			>
				<label for="scan-photo" class="block">Card photo</label>
				<input
					id="scan-photo"
					type="file"
					accept="image/jpeg,image/png,image/webp"
					bind:files
					required
					disabled={busy}
					class="block w-full text-sm"
					aria-describedby="scan-upload-help"
				/>
				<p id="scan-upload-help" class="text-text-secondary">
					One card photo per session. Choose a JPEG, PNG, or WebP image.
				</p>
				<button class="btn btn-primary" disabled={busy || !files?.length}
					>{busy ? 'Uploading...' : 'Upload photo'}</button
				>
			</form>
		{/if}
		{#if artifact}
			<div class="grid items-start gap-5 md:grid-cols-[minmax(180px,280px)_1fr]">
				<div class="surface-card space-y-3 p-3">
					<img
						src={`${api}/scan/artifacts/${artifact.id}/image`}
						alt="Original card submitted for review"
						class="max-h-[420px] w-full rounded object-contain"
					/>

					{#if candidates.length === 0}<p class="text-text-secondary">
							No recognition candidates. Search the catalog to select the printing manually.
						</p>{/if}
					{#each candidates as candidate}
						<button
							class="btn btn-secondary w-full flex-col items-start text-left"
							disabled={busy || searching || !editable}
							onclick={() =>
								chooseCard(
									candidate.oracleId || candidate.canonicalCardId,
									candidate.catalogCardId
								)}
						>
							<span>{candidate.name}</span><span class="text-xs"
								>{candidate.setCode.toUpperCase()} #{candidate.collectorNumber} · Score {candidate.finalScore}/100</span
							>
						</button>
					{/each}
				</div>
				<div class="space-y-4">
					{#if editable}
						<form
							class="flex items-end gap-2"
							onsubmit={(event) => {
								event.preventDefault();
								search();
							}}
						>
							<div class="min-w-0 flex-1">
								<label for="scan-search" class="mb-1 block">Find card</label><input
									id="scan-search"
									class="input w-full"
									bind:value={query}
									minlength="2"
									required
									disabled={busy || searching}
								/>
							</div>
							<button
								class="btn btn-secondary"
								disabled={busy || searching || query.trim().length < 2}
								>{searching ? 'Searching...' : 'Search'}</button
							>
						</form>
						{#if searched && !hits.length}<p role="status" class="text-text-secondary">
								No cards found. Try another name.
							</p>{/if}
						{#if hits.length}
							<ul class="surface-card max-h-64 overflow-y-auto divide-y divide-mist">
								{#each hits as card}<li>
										<button
											class="w-full px-3 py-2 text-left hover:bg-mist"
											disabled={busy || searching}
											onclick={() => chooseCard(card.oracle_id, card.id)}
											>{card.name}
											<span class="text-text-secondary"
												>{card.set_code.toUpperCase()} #{card.collector_number}</span
											></button
										>
									</li>{/each}
							</ul>
						{/if}
					{/if}
					{#if selected}
						<form
							class="surface-card space-y-4 p-4"
							onsubmit={(event) => {
								event.preventDefault();
								commit();
							}}
						>
							<div class="flex items-start gap-3">
								{#if selected.imageUri}<img
										src={selected.imageUri}
										alt={selected.name}
										class="w-20 rounded"
									/>{/if}
								<p>
									{selected.name}<span class="mt-1 block text-text-secondary"
										>{selected.setCode.toUpperCase()} #{selected.collectorNumber}</span
									>
								</p>
							</div>
							<fieldset
								disabled={busy || searching || !editable}
								class="space-y-4"
								oninput={() => {
									confirmed = false;
								}}
							>
								<legend class="sr-only">Printing and inventory details</legend>
								{#if printings.length}
									<div>
										<label for="scan-printing" class="mb-1 block">Printing</label><Select
											id="scan-printing"
											label="Printing"
											value={selected.catalogCardId}
											disabled={busy || searching || !editable}
											options={printings.map((card) => ({
												value: card.id,
												label: `${card.set_name} · ${card.set_code.toUpperCase()} #${card.collector_number} · ${card.lang}`
											}))}
											onchange={(value) => {
												confirmed = false;
												const card = printings.find((entry) => entry.id === value);
												if (card) choosePrinting(card);
											}}
										/>
									</div>
									{#if printingCount > printings.length}<button
											type="button"
											class="btn btn-secondary"
											onclick={morePrintings}
											>Load more printings ({printings.length} of {printingCount})</button
										>{/if}
								{/if}
								<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
									<div>
										<label for="scan-quantity" class="mb-1 block">Quantity</label><input
											id="scan-quantity"
											class="input w-full"
											type="number"
											min="1"
											max="2147483647"
											step="1"
											bind:value={quantity}
											required
										/>
									</div>
									<div>
										<label for="scan-finish" class="mb-1 block">Finish</label><Select
											id="scan-finish"
											label="Finish"
											bind:value={finish}
											disabled={busy || searching || !editable}
											onchange={() => (confirmed = false)}
											options={[
												{
													value: 'nonfoil',
													label: 'Nonfoil',
													disabled: selectedPrinting?.is_nonfoil_available === false
												},
												{
													value: 'foil',
													label: 'Foil',
													disabled: selectedPrinting?.is_foil_available === false
												}
											]}
										/>
									</div>
									<div>
										<label for="scan-condition" class="mb-1 block">Condition</label><Select
											id="scan-condition"
											label="Condition"
											bind:value={condition}
											disabled={busy || searching || !editable}
											onchange={() => (confirmed = false)}
											options={conditions.map(([value, label]) => ({ value, label }))}
										/>
									</div>
								</div>
							</fieldset>
							{#if editable}
								<label class="flex items-start gap-2"
									><input
										type="checkbox"
										bind:checked={confirmed}
										disabled={busy || searching}
										class="mt-1 accent-gold"
									/><span
										>I checked the printing, finish, condition, and quantity. Add {quantity}
										{quantity === 1 ? 'copy' : 'copies'} to inventory.</span
									></label
								>
								<button
									class="btn btn-primary"
									disabled={busy || searching || !confirmed || !validQuantity}
									>{busy ? 'Adding...' : 'Confirm and add to inventory'}</button
								>
							{/if}
						</form>
					{/if}
					{#if session.status === 'committed'}<p role="status">
							This scan has been added to inventory. <a
								href="/mtg/inventory"
								class="text-gold-bright underline">Open inventory</a
							>
						</p>{/if}
				</div>
			</div>
		{/if}
	{/if}
	<div
		class="scan-sessions grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
	>
		<div class="min-w-0">
			<label for="scan-session" class="mb-1 block">Recent scans</label>
			<Select
				id="scan-session"
				label="Session"
				placeholder={sessions.length ? 'Choose a scan' : 'No scans yet'}
				value={session?.id ?? ''}
				disabled={busy}
				onchange={openSession}
				options={sessions.map((entry) => ({
					value: entry.id,
					label: `${new Date(entry.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })} · ${(entry.id === session?.id ? session.status : entry.status).replaceAll('_', ' ')}`
				}))}
			/>
		</div>
		<details class="scan-recovery">
			<summary>Open by session ID</summary>
			<form
				class="mt-3 flex min-w-0 items-end gap-2"
				onsubmit={(event) => {
					event.preventDefault();
					openSession(sessionInput.trim());
				}}
			>
				<div class="min-w-0 flex-1">
					<label for="scan-session-id" class="mb-1 block">Session ID</label><input
						id="scan-session-id"
						class="input w-full font-mono text-xs"
						bind:value={sessionInput}
						required
						disabled={busy}
					/>
				</div>
				<button class="btn btn-secondary" disabled={busy}>Open</button>
			</form>
		</details>
		{#if session}<button class="btn btn-secondary" disabled={busy} onclick={refresh}>Refresh</button
			>{/if}
	</div>
</div>

<style>
	.scan-sessions {
		padding-top: 1rem;
		border-top: 1px solid var(--color-border);
		font-size: 0.8125rem;
	}
	.scan-recovery summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
		text-decoration: underline;
		text-underline-offset: 4px;
	}
</style>
