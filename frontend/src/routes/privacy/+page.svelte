<script lang="ts">
	import { page } from '$app/state';
	import { SITE_NAME, pageMetadata } from '$lib/seo/site';

	const meta = $derived(
		pageMetadata({
			origin: page.url.origin,
			path: '/privacy',
			title: 'Privacy Policy - Spellbook',
			description: 'How Spellbook handles account data, cookies, and related inventory information.'
		})
	);
</script>

<svelte:head>
	<title>{meta.title}</title>
	<meta name="description" content={meta.description} />
	<link rel="canonical" href={meta.canonical} />
	<meta property="og:title" content={meta.title} />
	<meta property="og:description" content={meta.description} />
	<meta property="og:url" content={meta.url} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={meta.title} />
	<meta name="twitter:description" content={meta.description} />
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-12">
	<h1
		class="mb-2 font-display text-3xl font-bold text-gold-bright"
		style="text-shadow: 0 0 16px rgba(232, 184, 75, 0.2);"
	>
		Privacy Policy
	</h1>
	<p class="mb-10 font-body text-sm text-text-muted">Last updated: March 25, 2026</p>

	<div class="space-y-8 font-body text-sm leading-relaxed text-text-secondary">
		<!-- 1. Scope -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">1. Scope</h2>
			<p class="mb-2">
				This privacy policy applies exclusively to the instance of Spellbook operated at
				<strong class="text-text-primary">spellbook.kylehub.dev</strong>. It does not cover any
				other deployment or self-hosted instance of the Spellbook software.
			</p>
			<p>
				Spellbook is open-source software licensed under the AGPL-3.0. If you operate your own
				instance or offer Spellbook as a service, you are solely responsible for providing your own
				privacy policy and complying with all applicable data protection regulations. The policies
				described here may not apply to your deployment.
			</p>
		</section>

		<!-- 2. Responsible Party -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				2. Responsible Party
			</h2>
			<p>
				The responsible party (Verantwortlicher) within the meaning of Art. 4 No. 7 GDPR for this
				website is identified in our
				<a
					href="https://kylehub.dev/impressum"
					target="_blank"
					rel="noopener noreferrer"
					class="text-gold underline decoration-gold-dim underline-offset-2 transition-colors hover:text-gold-bright"
					>Impressum</a
				>.
			</p>
		</section>

		<!-- 3. Overview -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">3. Overview</h2>
			<p>
				Spellbook is a Magic: The Gathering inventory and deck management application. We are
				committed to protecting your privacy. We collect only the data strictly necessary to provide
				the service.
			</p>
		</section>

		<!-- 4. Hosting & Data Location -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				4. Hosting and Data Location
			</h2>
			<p>
				All servers are located exclusively within the European Union, hosted at Hetzner Online GmbH
				data centers in Germany. Hetzner acts as a data processor (Auftragsverarbeiter) under a Data
				Processing Agreement (AVV) pursuant to Art. 28 GDPR. Your data is never transferred outside
				the EU.
			</p>
		</section>

		<!-- 5. Data We Collect -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">5. Data We Collect</h2>

			<h3 class="mb-2 mt-4 font-display text-base font-medium text-text-primary">
				5.1 Server Logs
			</h3>
			<p class="mb-2">When you access Spellbook, our servers automatically record:</p>
			<ul class="ml-4 list-inside list-disc space-y-1 text-text-muted">
				<li>IP address</li>
				<li>Date and time of the request</li>
				<li>Requested URL and HTTP method</li>
				<li>HTTP status code and response size</li>
				<li>Browser type and operating system (User-Agent)</li>
			</ul>
			<p class="mt-2">
				<strong class="text-text-primary">Legal basis:</strong> Art. 6(1)(f) GDPR (legitimate interest
				in ensuring network security and service stability).
			</p>
			<p>
				<strong class="text-text-primary">Retention:</strong> Server logs are automatically deleted after
				14 days.
			</p>

			<h3 class="mb-2 mt-4 font-display text-base font-medium text-text-primary">
				5.2 User Account Data
			</h3>
			<p class="mb-2">When you use Spellbook, we store the following account-related data:</p>
			<ul class="ml-4 list-inside list-disc space-y-1 text-text-muted">
				<li>Username</li>
				<li>Email address</li>
				<li>
					No local password is stored by Spellbook; authentication is handled by the upstream
					identity-aware proxy
				</li>
				<li>Your inventory, decks, and related card metadata</li>
			</ul>
			<p class="mt-2">
				<strong class="text-text-primary">Legal basis:</strong> Art. 6(1)(b) GDPR (necessary for the performance
				of the service).
			</p>
			<p>
				<strong class="text-text-primary">Retention:</strong> Account data is retained for the duration
				of your account. Upon account deletion, all personal data is removed within 30 days.
			</p>

			<h3 class="mb-2 mt-4 font-display text-base font-medium text-text-primary">5.3 Cookies</h3>
			<p>
				Spellbook uses only technically necessary cookies required for the service to function
				(e.g., session management). We do not use any tracking, analytics, or advertising cookies.
				The placement of these strictly necessary cookies is permitted without consent under &sect;
				25(2) TDDDG (Telekommunikation-Digitale-Dienste-Datenschutz-Gesetz). The subsequent
				processing of any personal data associated with these cookies is based on Art. 6(1)(f) GDPR
				(legitimate interest in providing the service).
			</p>
		</section>

		<!-- 6. Data We Do NOT Collect -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				6. Data We Do Not Collect
			</h2>
			<ul class="ml-4 list-inside list-disc space-y-1">
				<li>No analytics or tracking scripts</li>
				<li>No advertising or marketing cookies</li>
				<li>No social media integrations or embeds</li>
				<li>No data sold to or shared with third parties for their own purposes</li>
				<li>No profiling or automated decision-making</li>
			</ul>
		</section>

		<!-- 7. Third-Party Data Sharing -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				7. Third-Party Data Sharing
			</h2>
			<p>
				We do not sell, rent, or otherwise disclose your personal data to any third party for their
				own purposes. Our hosting provider, Hetzner Online GmbH, processes data on our behalf as a
				data processor (Auftragsverarbeiter) under a Data Processing Agreement (AVV) in accordance
				with Art. 28 GDPR. All data processing occurs exclusively within the EU on Hetzner
				infrastructure located in Germany.
			</p>
		</section>

		<!-- 8. Data Security -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">8. Data Security</h2>
			<p>
				We implement appropriate technical and organizational measures to protect your personal data
				against unauthorized access, alteration, disclosure, or destruction. All connections to
				Spellbook are encrypted via TLS/HTTPS.
			</p>
		</section>

		<!-- 9. Your Rights -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				9. Your Rights Under GDPR
			</h2>
			<p class="mb-3">
				Under the General Data Protection Regulation, you have the following rights regarding your
				personal data:
			</p>
			<ul class="ml-4 list-inside list-disc space-y-2">
				<li>
					<strong class="text-text-primary">Right of Access (Art. 15)</strong> - Request information about
					what personal data we store about you.
				</li>
				<li>
					<strong class="text-text-primary">Right to Rectification (Art. 16)</strong> - Request correction
					of inaccurate personal data.
				</li>
				<li>
					<strong class="text-text-primary">Right to Erasure (Art. 17)</strong> - Request deletion of
					your personal data.
				</li>
				<li>
					<strong class="text-text-primary">Right to Restrict Processing (Art. 18)</strong>
					- Request limitation of data processing.
				</li>
				<li>
					<strong class="text-text-primary">Right to Data Portability (Art. 20)</strong> - Receive your
					data in a structured, machine-readable format.
				</li>
				<li>
					<strong class="text-text-primary">Right to Object (Art. 21)</strong> - Object to processing
					based on legitimate interest.
				</li>
				<li>
					<strong class="text-text-primary">Right to Lodge a Complaint (Art. 77)</strong> - File a complaint
					with a supervisory authority. The competent authority in Germany is the Landesbeauftragte f&uuml;r
					Datenschutz und Informationsfreiheit Nordrhein-Westfalen (LDI NRW).
				</li>
			</ul>
			<p class="mt-3">
				To exercise any of these rights, please contact us at
				<a
					href="mailto:privacy@kylehub.dev"
					class="text-gold underline decoration-gold-dim underline-offset-2 transition-colors hover:text-gold-bright"
					>privacy@kylehub.dev</a
				>. We will respond to your request without undue delay and within one month at the latest.
			</p>
		</section>

		<!-- 10. Changes -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				10. Changes to This Policy
			</h2>
			<p>
				We may update this privacy policy to reflect changes in our practices or for legal reasons.
				The "Last updated" date at the top will be revised accordingly. We encourage you to review
				this page periodically.
			</p>
		</section>

		<!-- 11. Contact -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">11. Contact</h2>
			<p class="mb-3">
				For privacy-related inquiries, data subject requests, or to report a concern:
			</p>
			<ul class="ml-4 list-inside list-disc space-y-1 text-text-muted">
				<li>
					Privacy:
					<a
						href="mailto:privacy@kylehub.dev"
						class="text-gold underline decoration-gold-dim underline-offset-2 transition-colors hover:text-gold-bright"
						>privacy@kylehub.dev</a
					>
				</li>
				<li>
					Security:
					<a
						href="mailto:security@kylehub.dev"
						class="text-gold underline decoration-gold-dim underline-offset-2 transition-colors hover:text-gold-bright"
						>security@kylehub.dev</a
					>
				</li>
				<li>
					General inquiries:
					<a
						href="mailto:info@kylehub.dev"
						class="text-gold underline decoration-gold-dim underline-offset-2 transition-colors hover:text-gold-bright"
						>info@kylehub.dev</a
					>
				</li>
			</ul>
		</section>
	</div>
</div>
