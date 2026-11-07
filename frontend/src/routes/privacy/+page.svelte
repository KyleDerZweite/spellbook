<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { page } from '$app/state';
	import { SITE_NAME, pageMetadata } from '#lib/seo/site.ts';

	const meta = $derived(
		pageMetadata({
			origin: page.url.origin,
			path: '/privacy',
			title: language.t('ui.Privacy.Policy.Spellbook'),
			description: language.t(
				'ui.How.Spellbook.handles.account.data.cookies.and.related.inventory.information'
			)
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

<div class="legal-page mx-auto px-4 py-8 sm:px-6">
	<h1 class="mb-2 font-display text-xl font-semibold text-text-primary">
		{language.t('ui.Privacy.Policy')}
	</h1>
	<p class="mb-8 font-body text-sm text-text-muted">
		{language.t('ui.Last.updated.October.3.2026')}
	</p>

	<div class="space-y-8 font-body text-sm text-text-secondary">
		<!-- 1. Scope -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.1.Scope')}
			</h2>
			<p class="mb-2">
				{language.t(
					'ui.This.privacy.policy.applies.exclusively.to.the.instance.of.Spellbook.operated.at'
				)}
				<strong class="text-text-primary">spellbook.kylehub.dev</strong>{language.t(
					'ui.It.does.not.cover.any.other.deployment.or.self.hosted.instance.of.the.Spellbook.software'
				)}
			</p>
			<p>
				{language.t(
					'ui.Spellbook.is.open.source.software.licensed.under.the.AGPL.3.0.If.you.operate.your.own.instance.or.offer.Spellbook.as.a.service.you.are.solely.responsible.for.providing.your.own.privacy.policy.and.complying.with.all.applicable.data.protection.regulations.The.policies.described.here.may.not.apply.to.your.deployment'
				)}
			</p>
		</section>

		<!-- 2. Responsible Party -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.2.Responsible.Party')}
			</h2>
			<p>
				{language.t(
					'ui.The.responsible.party.Verantwortlicher.within.the.meaning.of.Art.4.No.7.GDPR.for.this.website.is.identified.in.our'
				)}
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
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.3.Overview')}
			</h2>
			<p>
				{language.t(
					'ui.Spellbook.is.a.Magic.The.Gathering.inventory.and.deck.management.application.We.are.committed.to.protecting.your.privacy.We.collect.only.the.data.strictly.necessary.to.provide.the.service'
				)}
			</p>
		</section>

		<!-- 4. Hosting & Data Location -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.4.Hosting.and.Data.Location')}
			</h2>
			<p>
				{language.t(
					'ui.All.servers.are.located.exclusively.within.the.European.Union.hosted.at.Hetzner.Online.GmbH.data.centers.in.Germany.Hetzner.acts.as.a.data.processor.Auftragsverarbeiter.under.a.Data.Processing.Agreement.AVV.pursuant.to.Art.28.GDPR.Your.data.is.never.transferred.outside.the.EU'
				)}
			</p>
		</section>

		<!-- 5. Data We Collect -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.5.Data.We.Collect')}
			</h2>

			<h3 class="mb-2 mt-4 font-display text-base font-medium text-text-primary">
				{language.t('ui.5.1.Server.Logs')}
			</h3>
			<p class="mb-2">
				{language.t('ui.When.you.access.Spellbook.our.servers.automatically.record')}
			</p>
			<ul class="ml-4 list-inside list-disc space-y-1 text-text-muted">
				<li>{language.t('ui.IP.address')}</li>
				<li>{language.t('ui.Date.and.time.of.the.request')}</li>
				<li>{language.t('ui.Requested.URL.and.HTTP.method')}</li>
				<li>{language.t('ui.HTTP.status.code.and.response.size')}</li>
				<li>{language.t('ui.Browser.type.and.operating.system.User.Agent')}</li>
			</ul>
			<p class="mt-2">
				<strong class="text-text-primary">{language.t('ui.Legal.basis')}</strong>
				{language.t(
					'ui.Art.6.1.f.GDPR.legitimate.interest.in.ensuring.network.security.and.service.stability'
				)}
			</p>
			<p>
				<strong class="text-text-primary">{language.t('ui.Retention')}</strong>
				{language.t('ui.Server.logs.are.automatically.deleted.after.14.days')}
			</p>

			<h3 class="mb-2 mt-4 font-display text-base font-medium text-text-primary">
				{language.t('ui.5.2.User.Account.Data')}
			</h3>
			<p class="mb-2">
				{language.t('ui.When.you.use.Spellbook.we.store.the.following.account.related.data')}
			</p>
			<ul class="ml-4 list-inside list-disc space-y-1 text-text-muted">
				<li>{language.t('ui.Username')}</li>
				<li>{language.t('ui.Email.address')}</li>
				<li>
					{language.t(
						'ui.A.salted.password.hash.for.your.local.account.Spellbook.does.not.store.your.password.in.plaintext'
					)}
				</li>
				<li>{language.t('ui.Your.inventory.decks.and.related.card.metadata')}</li>
			</ul>
			<p class="mt-2">
				<strong class="text-text-primary">{language.t('ui.Legal.basis')}</strong>
				{language.t('ui.Art.6.1.b.GDPR.necessary.for.the.performance.of.the.service')}
			</p>
			<p>
				<strong class="text-text-primary">{language.t('ui.Retention')}</strong>
				{language.t(
					'ui.Account.data.is.retained.for.the.duration.of.your.account.Upon.account.deletion.all.personal.data.is.removed.within.30.days'
				)}
			</p>

			<h3 class="mb-2 mt-4 font-display text-base font-medium text-text-primary">
				{language.t('ui.5.3.Cookies')}
			</h3>
			<p>
				{language.t(
					'ui.Spellbook.uses.only.technically.necessary.cookies.required.for.the.service.to.function.e.g.session.management.We.do.not.use.any.tracking.analytics.or.advertising.cookies.The.placement.of.these.strictly.necessary.cookies.is.permitted.without.consent.under.25.2.TDDDG.Telekommunikation.Digitale.Dienste.Datenschutz.Gesetz.The.subsequent.processing.of.any.personal.data.associated.with.these.cookies.is.based.on.Art.6.1.f.GDPR.legitimate.interest.in.providing.the.service'
				)}
			</p>
		</section>

		<!-- 6. Data We Do NOT Collect -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.6.Data.We.Do.Not.Collect')}
			</h2>
			<ul class="ml-4 list-inside list-disc space-y-1">
				<li>{language.t('ui.No.analytics.or.tracking.scripts')}</li>
				<li>{language.t('ui.No.advertising.or.marketing.cookies')}</li>
				<li>{language.t('ui.No.social.media.integrations.or.embeds')}</li>
				<li>
					{language.t('ui.No.data.sold.to.or.shared.with.third.parties.for.their.own.purposes')}
				</li>
				<li>{language.t('ui.No.profiling.or.automated.decision.making')}</li>
			</ul>
		</section>

		<!-- 7. Third-Party Data Sharing -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.7.Third.Party.Data.Sharing')}
			</h2>
			<p>
				{language.t(
					'ui.We.do.not.sell.rent.or.otherwise.disclose.your.personal.data.to.any.third.party.for.their.own.purposes.Our.hosting.provider.Hetzner.Online.GmbH.processes.data.on.our.behalf.as.a.data.processor.Auftragsverarbeiter.under.a.Data.Processing.Agreement.AVV.in.accordance.with.Art.28.GDPR.All.data.processing.occurs.exclusively.within.the.EU.on.Hetzner.infrastructure.located.in.Germany'
				)}
			</p>
		</section>

		<!-- 8. Data Security -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.8.Data.Security')}
			</h2>
			<p>
				{language.t(
					'ui.We.implement.appropriate.technical.and.organizational.measures.to.protect.your.personal.data.against.unauthorized.access.alteration.disclosure.or.destruction.All.connections.to.Spellbook.are.encrypted.via.TLS.HTTPS'
				)}
			</p>
		</section>

		<!-- 9. Your Rights -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.9.Your.Rights.Under.GDPR')}
			</h2>
			<p class="mb-3">
				{language.t(
					'ui.Under.the.General.Data.Protection.Regulation.you.have.the.following.rights.regarding.your.personal.data'
				)}
			</p>
			<ul class="ml-4 list-inside list-disc space-y-2">
				<li>
					<strong class="text-text-primary">{language.t('ui.Right.of.Access.Art.15')}</strong>
					{language.t('ui.Request.information.about.what.personal.data.we.store.about.you')}
				</li>
				<li>
					<strong class="text-text-primary">{language.t('ui.Right.to.Rectification.Art.16')}</strong
					>
					{language.t('ui.Request.correction.of.inaccurate.personal.data')}
				</li>
				<li>
					<strong class="text-text-primary">{language.t('ui.Right.to.Erasure.Art.17')}</strong>
					{language.t('ui.Request.deletion.of.your.personal.data')}
				</li>
				<li>
					<strong class="text-text-primary"
						>{language.t('ui.Right.to.Restrict.Processing.Art.18')}</strong
					>
					{language.t('ui.Request.limitation.of.data.processing')}
				</li>
				<li>
					<strong class="text-text-primary"
						>{language.t('ui.Right.to.Data.Portability.Art.20')}</strong
					>
					{language.t('ui.Receive.your.data.in.a.structured.machine.readable.format')}
				</li>
				<li>
					<strong class="text-text-primary">{language.t('ui.Right.to.Object.Art.21')}</strong>
					{language.t('ui.Object.to.processing.based.on.legitimate.interest')}
				</li>
				<li>
					<strong class="text-text-primary"
						>{language.t('ui.Right.to.Lodge.a.Complaint.Art.77')}</strong
					>
					{language.t(
						'ui.File.a.complaint.with.a.supervisory.authority.The.competent.authority.in.Germany.is.the.Landesbeauftragte.f.r.Datenschutz.und.Informationsfreiheit.Nordrhein.Westfalen.LDI.NRW'
					)}
				</li>
			</ul>
			<p class="mt-3">
				{language.t('ui.To.exercise.any.of.these.rights.please.contact.us.at')}
				<a
					href="mailto:privacy@kylehub.dev"
					class="text-gold underline decoration-gold-dim underline-offset-2 transition-colors hover:text-gold-bright"
					>privacy@kylehub.dev</a
				>{language.t(
					'ui.We.will.respond.to.your.request.without.undue.delay.and.within.one.month.at.the.latest'
				)}
			</p>
		</section>

		<!-- 10. Changes -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.10.Changes.to.This.Policy')}
			</h2>
			<p>
				{language.t(
					'ui.We.may.update.this.privacy.policy.to.reflect.changes.in.our.practices.or.for.legal.reasons.The.Last.updated.date.at.the.top.will.be.revised.accordingly.We.encourage.you.to.review.this.page.periodically'
				)}
			</p>
		</section>

		<!-- 11. Contact -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.11.Contact')}
			</h2>
			<p class="mb-3">
				{language.t(
					'ui.For.privacy.related.inquiries.data.subject.requests.or.to.report.a.concern'
				)}
			</p>
			<ul class="ml-4 list-inside list-disc space-y-1 text-text-muted">
				<li>
					{language.t('ui.Privacy')}
					<a
						href="mailto:privacy@kylehub.dev"
						class="text-gold underline decoration-gold-dim underline-offset-2 transition-colors hover:text-gold-bright"
						>privacy@kylehub.dev</a
					>
				</li>
				<li>
					{language.t('ui.Security')}
					<a
						href="mailto:security@kylehub.dev"
						class="text-gold underline decoration-gold-dim underline-offset-2 transition-colors hover:text-gold-bright"
						>security@kylehub.dev</a
					>
				</li>
				<li>
					{language.t('ui.General.inquiries')}
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
