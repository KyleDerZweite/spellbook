<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { page } from '$app/state';
	import { SITE_NAME, pageMetadata } from '#lib/seo/site.ts';

	const meta = $derived(
		pageMetadata({
			origin: page.url.origin,
			path: '/terms',
			title: language.t('ui.Terms.of.Service.Spellbook'),
			description: language.t('ui.The.terms.that.govern.use.of.this.Spellbook.instance')
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
		{language.t('ui.Terms.of.Service')}
	</h1>
	<p class="mb-8 font-body text-sm text-text-muted">
		{language.t('ui.Last.updated.March.25.2026')}
	</p>

	<div class="space-y-8 font-body text-sm text-text-secondary">
		<!-- 1. Scope -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.1.Scope')}
			</h2>
			<p class="mb-2">
				{language.t(
					'ui.These.Terms.of.Service.apply.exclusively.to.the.instance.of.Spellbook.operated.at'
				)}
				<strong class="text-text-primary">spellbook.kylehub.dev</strong>{language.t(
					'ui.They.do.not.cover.any.other.deployment.or.self.hosted.instance.of.the.Spellbook.software'
				)}
			</p>
			<p class="mb-2">
				{language.t(
					'ui.Spellbook.is.open.source.software.licensed.under.the.AGPL.3.0.If.you.operate.your.own.instance.or.offer.Spellbook.as.a.service.you.are.solely.responsible.for.providing.your.own.terms.of.service.and.complying.with.all.applicable.regulations.The.terms.described.here.may.not.apply.to.your.deployment'
				)}
			</p>
			<p>
				{language.t(
					'ui.Spellbook.is.a.web.based.Magic.The.Gathering.inventory.deck.management.and.card.search.application.By.accessing.or.using.this.instance.you.agree.to.these.Terms.of.Service.If.you.do.not.agree.please.discontinue.use.of.the.service'
				)}
			</p>
		</section>

		<!-- 2. Operator -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.2.Operator')}
			</h2>
			<p>
				{language.t('ui.The.operator.of.this.service.is.identified.in.the')}
				<a
					href="https://kylehub.dev/impressum"
					target="_blank"
					rel="noopener noreferrer"
					class="text-gold underline decoration-gold-dim underline-offset-2 transition-colors hover:text-gold-bright"
					>Impressum</a
				>.
			</p>
		</section>

		<!-- 3. User Obligations -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.3.User.Obligations')}
			</h2>
			<p class="mb-2">{language.t('ui.By.using.Spellbook.you.agree.to')}</p>
			<ul class="ml-4 list-inside list-disc space-y-1">
				<li>
					{language.t(
						'ui.Use.the.service.only.for.its.intended.purpose.of.managing.Magic.The.Gathering.inventory.and.decks'
					)}
				</li>
				<li>
					{language.t(
						'ui.Not.attempt.to.disrupt.overload.or.compromise.the.service.or.its.infrastructure'
					)}
				</li>
				<li>
					{language.t(
						'ui.Not.use.automated.tools.bots.scrapers.to.access.the.service.without.prior.written.permission'
					)}
				</li>
				<li>
					{language.t(
						'ui.Not.reverse.engineer.decompile.or.otherwise.attempt.to.extract.the.source.code.beyond.what.is.permitted.by.the.project.s.open.source.license'
					)}
				</li>
				<li>{language.t('ui.Comply.with.all.applicable.laws.and.regulations')}</li>
			</ul>
		</section>

		<!-- 4. Intellectual Property -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.4.Intellectual.Property')}
			</h2>
			<p class="mb-2">
				{language.t(
					'ui.Magic.The.Gathering.including.all.card.names.artwork.and.game.mechanics.is.the.property.of.Wizards.of.the.Coast.LLC.Spellbook.is.not.affiliated.with.endorsed.by.or.sponsored.by.Wizards.of.the.Coast'
				)}
			</p>
			<p class="mb-2">
				{language.t('ui.Card.data.displayed.in.Spellbook.is.sourced.from')}
				<a
					href="https://scryfall.com/"
					target="_blank"
					rel="noopener noreferrer"
					class="text-gold underline decoration-gold-dim underline-offset-2 transition-colors hover:text-gold-bright"
					>Scryfall</a
				>{language.t('ui.which.provides.this.data.under.its.own.terms.of.use')}
			</p>
			<p>
				{language.t(
					'ui.The.Spellbook.application.itself.is.licensed.under.the.GNU.Affero.General.Public.License.v3.0.AGPL.3.0.You.retain.full.ownership.of.your.personal.inventory.and.deck.data'
				)}
			</p>
		</section>

		<!-- 5. Availability -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.5.Service.Availability')}
			</h2>
			<p>
				{language.t(
					'ui.Spellbook.is.provided.on.a.best.effort.basis.We.do.not.guarantee.uninterrupted.or.error.free.availability.We.reserve.the.right.to.modify.suspend.or.discontinue.any.part.of.the.service.at.any.time.with.or.without.notice.Scheduled.maintenance.will.be.communicated.in.advance.where.possible'
				)}
			</p>
		</section>

		<!-- 6. Limitation of Liability -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.6.Limitation.of.Liability')}
			</h2>
			<p class="mb-2">
				{language.t(
					'ui.Spellbook.is.provided.as.is.without.warranties.of.any.kind.whether.express.or.implied.including.but.not.limited.to.warranties.of.merchantability.fitness.for.a.particular.purpose.or.accuracy.of.card.data'
				)}
			</p>
			<p class="mb-2">
				{language.t(
					'ui.To.the.fullest.extent.permitted.by.German.law.the.operator.shall.not.be.liable.for.any.indirect.incidental.or.consequential.damages.arising.from.the.use.of.or.inability.to.use.the.service.including.but.not.limited.to.loss.of.data'
				)}
			</p>
			<p>
				{language.t(
					'ui.This.limitation.does.not.apply.to.a.liability.for.intent.or.gross.negligence.b.damages.arising.from.injury.to.life.body.or.health.c.liability.under.mandatory.statutory.provisions.e.g.the.German.Product.Liability.Act.or.d.damages.resulting.from.a.negligent.breach.of.essential.contractual.obligations.Kardinalpflichten.in.which.case.liability.is.limited.to.foreseeable.contract.typical.damages'
				)}
			</p>
		</section>

		<!-- 7. Data Protection -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.7.Data.Protection')}
			</h2>
			<p>
				{language.t('ui.Your.use.of.Spellbook.is.also.governed.by.our')}
				<a
					href="/privacy"
					class="text-gold underline decoration-gold-dim underline-offset-2 transition-colors hover:text-gold-bright"
					>{language.t('ui.Privacy.Policy')}</a
				>{language.t(
					'ui.which.describes.what.data.we.collect.how.we.use.it.and.your.rights.under.the.GDPR'
				)}
			</p>
		</section>

		<!-- 8. Account Termination -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.8.Account.Termination')}
			</h2>
			<p class="mb-2">
				{language.t(
					'ui.You.may.stop.using.the.service.and.request.deletion.of.your.account.and.associated.data.at.any.time.by.contacting.us.at'
				)}
				<a
					href="mailto:support@kylehub.dev"
					class="text-gold underline decoration-gold-dim underline-offset-2 transition-colors hover:text-gold-bright"
					>support@kylehub.dev</a
				>.
			</p>
			<p>
				{language.t(
					'ui.We.reserve.the.right.to.suspend.or.terminate.accounts.that.violate.these.terms.Upon.termination.your.personal.data.will.be.handled.in.accordance.with.our.Privacy.Policy'
				)}
			</p>
		</section>

		<!-- 9. Changes to Terms -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.9.Changes.to.These.Terms')}
			</h2>
			<p>
				{language.t(
					'ui.We.may.update.these.Terms.of.Service.from.time.to.time.The.Last.updated.date.at.the.top.will.be.revised.accordingly.For.material.changes.we.will.notify.you.and.request.your.explicit.consent.before.the.revised.terms.take.effect.If.you.do.not.consent.to.the.updated.terms.you.may.discontinue.use.of.the.service.and.request.deletion.of.your.account'
				)}
			</p>
		</section>

		<!-- 10. Governing Law -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.10.Governing.Law.and.Jurisdiction')}
			</h2>
			<p class="mb-2">
				{language.t(
					'ui.These.terms.are.governed.by.the.laws.of.the.Federal.Republic.of.Germany.and.applicable.European.Union.regulations.Mandatory.consumer.protection.provisions.of.your.country.of.residence.remain.unaffected'
				)}
			</p>
			<p>
				{language.t(
					'ui.For.disputes.that.cannot.be.resolved.amicably.the.courts.at.the.operator.s.place.of.business.shall.have.jurisdiction.unless.mandatory.legal.provisions.require.a.different.venue'
				)}
			</p>
		</section>

		<!-- 11. Online Dispute Resolution -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.11.Online.Dispute.Resolution')}
			</h2>
			<p>
				{language.t(
					'ui.The.European.Commission.provides.a.platform.for.online.dispute.resolution.OS'
				)}
				<a
					href="https://ec.europa.eu/consumers/odr"
					target="_blank"
					rel="noopener noreferrer"
					class="text-gold underline decoration-gold-dim underline-offset-2 transition-colors hover:text-gold-bright"
					>https://ec.europa.eu/consumers/odr</a
				>.
			</p>
		</section>

		<!-- 12. Severability -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.12.Severability')}
			</h2>
			<p>
				{language.t(
					'ui.If.any.provision.of.these.terms.is.found.to.be.invalid.or.unenforceable.the.remaining.provisions.shall.remain.in.full.force.and.effect.The.invalid.provision.shall.be.governed.by.the.applicable.statutory.provisions.section.306.BGB'
				)}
			</p>
		</section>

		<!-- 13. Contact -->
		<section>
			<h2 class="mb-3 font-display text-lg font-semibold text-text-primary">
				{language.t('ui.13.Contact')}
			</h2>
			<p class="mb-3">{language.t('ui.For.questions.about.these.terms')}</p>
			<ul class="ml-4 list-inside list-disc space-y-1 text-text-muted">
				<li>
					{language.t('ui.Legal')}
					<a
						href="mailto:legal@kylehub.dev"
						class="text-gold underline decoration-gold-dim underline-offset-2 transition-colors hover:text-gold-bright"
						>legal@kylehub.dev</a
					>
				</li>
				<li>
					{language.t('ui.Support')}
					<a
						href="mailto:support@kylehub.dev"
						class="text-gold underline decoration-gold-dim underline-offset-2 transition-colors hover:text-gold-bright"
						>support@kylehub.dev</a
					>
				</li>
				<li>
					{language.t('ui.Abuse.reports')}
					<a
						href="mailto:abuse@kylehub.dev"
						class="text-gold underline decoration-gold-dim underline-offset-2 transition-colors hover:text-gold-bright"
						>abuse@kylehub.dev</a
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
