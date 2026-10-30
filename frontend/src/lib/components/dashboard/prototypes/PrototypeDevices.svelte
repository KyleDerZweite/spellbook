<section class="prototype-devices">
	<header>
		<h2>Devices</h2>
		<span>Concept</span>
	</header>
	<div class="device">
		<svg
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			aria-hidden="true"
			><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10 18h4" /></svg
		><strong>Phone</strong><small>Status unknown</small><a href="/app/connect">Connect</a>
	</div>
	<div class="device">
		<svg
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			aria-hidden="true"
			><rect x="3" y="7" width="18" height="13" rx="3" /><path d="M8 7V3h8v4M7 13h10" /></svg
		><strong>Card scanner</strong><small>Not configured</small><span class="muted">—</span>
	</div>
</section>

<style>
	.prototype-devices {
		padding: 1.25rem;
		border-radius: 0.75rem;
		background: var(--color-card);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}
	h2 {
		font: 500 1rem var(--font-interface);
	}
	header span {
		font: 0.6875rem var(--font-interface);
		color: var(--color-text-muted);
	}
	.device {
		display: grid;
		grid-template-columns: 24px 1fr auto;
		gap: 0.25rem 0.75rem;
		align-items: center;
		padding: 0.75rem 0;
	}
	.device + .device {
		border-top: 1px solid var(--color-border);
	}
	svg {
		grid-row: 1/3;
		color: var(--color-text-muted);
	}
	strong {
		font: 400 0.8125rem var(--font-interface);
	}
	small {
		grid-column: 2;
		font: 0.6875rem var(--font-interface);
		color: var(--color-text-muted);
	}
	a,
	.muted {
		grid-column: 3;
		grid-row: 1/3;
		font: 0.6875rem var(--font-interface);
		color: var(--color-text-secondary);
	}
	a {
		text-decoration: none;
	}
	a:hover {
		text-decoration: underline;
	}
</style>
