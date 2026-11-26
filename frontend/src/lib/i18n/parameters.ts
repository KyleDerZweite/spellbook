export interface MessageParameters {
	'entries.one': { count: string | number };
	'entries.other': { count: string | number };
	'inventory.remove.description.one': {
		count: string | number;
		name: string | number;
		set: string | number;
		finish: string | number;
		condition: string | number;
	};
	'inventory.remove.description.other': {
		count: string | number;
		name: string | number;
		set: string | number;
		finish: string | number;
		condition: string | number;
	};
	'inventory.filter.set': { value: string | number };
	'inventory.filter.finish': { value: string | number };
	'inventory.filter.condition': { value: string | number };
	'inventory.owned.one': { count: string | number };
	'inventory.owned.other': { count: string | number };
	'inventory.owned.details.one': {
		count: string | number;
		finish: string | number;
		condition: string | number;
	};
	'inventory.owned.details.other': {
		count: string | number;
		finish: string | number;
		condition: string | number;
	};
	'inventory.order.set': { direction: string | number };
	'inventory.order.name': { direction: string | number };
	'inventory.order.set.variant': {
		direction: string | number;
		column: string | number;
		variantDirection: string | number;
	};
	'inventory.order.name.variant': {
		column: string | number;
		variantDirection: string | number;
		direction: string | number;
	};

	'qr.approval': { device: string | number; username: string | number };
	'deck.import.add.one': { count: string | number };
	'deck.import.add.other': { count: string | number };
	'deck.legality.notLegal': { format: string | number };
	'deck.legality.notLegalCount': { count: string | number; format: string | number };
	'deck.legality.warning.commander_color_identity': { card: string | number };
	'deck.legality.warning.commander_ineligible': { card: string | number };
	'deck.legality.warning.commander_invalid_pairing': {
		first: string | number;
		second: string | number;
	};
	'deck.legality.warning.copy_limit': {
		card: string | number;
		format: string | number;
		limit: string | number;
	};
	'deck.legality.warning.format_illegal': {
		card: string | number;
		format: string | number;
		status: string | number;
	};
	'deck.export.warningDescription': { target: string | number };
	'validation.characters': { count: string | number };
	'validation.lines': { count: string | number };
	'validation.placeholder': { token: string | number };
	'validation.braces': { example: string | number };
	'validation.mana': { example: string | number };
	'cards.one': { count: string | number };
	'cards.other': { count: string | number };
	'printPages.one': { count: string | number };
	'printPages.other': { count: string | number };
	'printSheet.loading': { loaded: string | number; total: string | number };
	'printSheet.pageLabel': { page: string | number; pages: string | number };
	'printing.one': { count: string | number };
	'printing.other': { count: string | number };
	'unique.one': { count: string | number };
	'unique.other': { count: string | number };
	'notice.covered.total.copies': { covered: string | number; total: string | number };
	'notice.covered.total.copies.priced': { covered: string | number; total: string | number };
	'notice.covered.of.total.copies.covered.unknown.unknown.stale.covered.by.stale.references': {
		covered: string | number;
		stale: string | number;
		total: string | number;
		unknown: string | number;
	};
	'filter.selected': { count: string | number };
	'filter.noMatch': { query: string | number };
	'message.Added.p0.of.p1.to.p2': { p0: string | number; p1: string | number; p2: string | number };
	'message.Show.p0.printings': { p0: string | number };
	'message.Added.p0.of.p1.to.inventory': { p0: string | number; p1: string | number };
	'message.p0.day.precision': { p0: string | number };
	'message.p0.identity': { p0: string | number };
	'message.Inventory.updated.p0.p1.p2': {
		p0: string | number;
		p1: string | number;
		p2: string | number;
	};
	'message.p0.p1.copies': { p0: string | number; p1: string | number };
	'message.p0.p1.copies.p2': { p0: string | number; p1: string | number; p2: string | number };
	'message.p0.30.closed.reporting.dates.p1': { p0: string | number; p1: string | number };
	'message.Add.p0': { p0: string | number };
	'message.Inspect.p0': { p0: string | number };
	'message.p0.shown': { p0: string | number };
	'message.Inspect.ownership.of.p0.p1': { p0: string | number; p1: string | number };
	'message.p0.copies': { p0: string | number };
	'message.p0.required.p1': { p0: string | number; p1: string | number };
	'message.p0.alternate': { p0: string | number };
	'message.p0.missing': { p0: string | number };
	'message.p0.cards': { p0: string | number };
	'message.p0.unavailable': { p0: string | number };
	'message.Inspect.commander.p0': { p0: string | number };
	'message.Mana.value.p0.p1.copies': { p0: string | number; p1: string | number };
	'message.Inventory.match.p0.exact.printing.p1.alternate.printing.p2.missing': {
		p0: string | number;
		p1: string | number;
		p2: string | number;
	};
	'message.Boxes.include.all.p0.p1.of.p2.p3.p4.p5': {
		p0: string | number;
		p1: string | number;
		p2: string | number;
		p3: string | number;
		p4: string | number;
		p5: string | number;
	};
	'message.Actions.for.box.p0': { p0: string | number };
	'message.Theme.p0.Switch.to.p1': { p0: string | number; p1: string | number };
	'message.Insert.KPI.into.p0': { p0: string | number };
	'message.p0.rarity': { p0: string | number };
	'message.Profile.card.for.p0': { p0: string | number };
	'message.Not.enough.space.for.this.KPI.The.limit.is.p0.characters': { p0: string | number };
	'message.Use.at.most.p0.lines': { p0: string | number };
	'message.Use.at.most.p0.characters': { p0: string | number };
	'message.p0.p1.Next.click.p2': { p0: string | number; p1: string | number; p2: string | number };
	'message.p0.p1.quantity': { p0: string | number; p1: string | number };
	'message.Saved.changes.synchronization.is.p0': { p0: string | number };
	'message.p0.Your.Magic.workspace': { p0: string | number };
	'message.p0.results': { p0: string | number };
	'message.p0.format.warnings': { p0: string | number };
	'message.Delete.p0.and.its.card.list.Your.inventory.stays.unchanged': { p0: string | number };
	'message.p0.Decks': { p0: string | number };
	'message.Delete.p0.Your.cards.stay.in.inventory.only.this.box.s.assignments.are.removed': {
		p0: string | number;
	};
	'message.Actions.for.p0.p1.p2.p3': {
		p0: string | number;
		p1: string | number;
		p2: string | number;
		p3: string | number;
	};
	'message.Added.p0.UTC.New.until.the.end.of.this.UTC.date': { p0: string | number };
	'message.Inspect.p0.p1.p2.p3': {
		p0: string | number;
		p1: string | number;
		p2: string | number;
		p3: string | number;
	};
	'message.Sort.by.p0.p1': { p0: string | number; p1: string | number };
	'message.p0.set.completion': { p0: string | number };
	'message.p0.card.names.owned': { p0: string | number };
	'message.p0.of.p1.card.names.owned': { p0: string | number; p1: string | number };
	'message.Clear.condition.filter.p0': { p0: string | number };
	'message.Clear.finish.filter.p0': { p0: string | number };
	'message.Clear.set.filter.p0': { p0: string | number };
	'message.Edit.set.filter.p0': { p0: string | number };
	'message.p0.saved': { p0: string | number };
	'message.p0.removed': { p0: string | number };
	'message.Added.p0.p1.of.p2.to.inventory': {
		p0: string | number;
		p1: string | number;
		p2: string | number;
	};
	'message.Request.failed.p0.Try.again': { p0: string | number };
	'message.p0.avatar': { p0: string | number };
	'sentence.Original.unconfirmed.addition.p0.of.p1.to.p2.p3.New.controls.are.a.separate.intent': {
		p0: string | number;
		p1: string | number;
		p2: string | number;
		p3: string | number;
	};
	'sentence.Original.unconfirmed.addition.p0.of.p1.p2.p3': {
		p0: string | number;
		p1: string | number;
		p2: string | number;
		p3: string | number;
	};
	'sentence.Original.submitted.Inventory.addition.p0.p1.p2': {
		p0: string | number;
		p1: string | number;
		p2: string | number;
	};
	'sentence.Original.submitted.addition.p0.of.p1.to.p2.p3': {
		p0: string | number;
		p1: string | number;
		p2: string | number;
		p3: string | number;
	};
	'sentence.Freshness.uses.a.conservative.UTC.day.bound.evaluated.p0': { p0: string | number };
	'sentence.Coverage.0.of.p0.p1': { p0: string | number; p1: string | number };
	'sentence.Coverage.p0.of.p1.p2.p3': {
		p0: string | number;
		p1: string | number;
		p2: string | number;
		p3: string | number;
	};
	'sentence.p0.p1.Estimated.reference.total.p2': {
		p0: string | number;
		p1: string | number;
		p2: string | number;
	};
	'sentence.p0.total': { p0: string | number };
	'sentence.p0.p1.copies.covered.p2': {
		p0: string | number;
		p1: string | number;
		p2: string | number;
	};
	'sentence.p0.copies': { p0: string | number };
	'sentence.p0.p1.p2.owned': { p0: string | number; p1: string | number; p2: string | number };
	'sentence.p0.cards': { p0: string | number };
	'sentence.p0.nonland.copies': { p0: string | number };
	'sentence.Artwork.unavailable.for.p0': { p0: string | number };
	'sentence.p0.p1.owned': { p0: string | number; p1: string | number };
	'sentence.p0.unknown.p1.stale': { p0: string | number; p1: string | number };
	'sentence.p0.p1.copies': { p0: string | number; p1: string | number };
	'sentence.p0.p1.without.a.capture': { p0: string | number; p1: string | number };
	'sentence.p0.to.p1': { p0: string | number; p1: string | number };
	'sentence.This.deck.p0.missing.Inventory.is.not.reserved': { p0: string | number };
	'sentence.p0.cards.matched.for.import': { p0: string | number };
	'sentence.p0.unavailable.Printing.p1': { p0: string | number; p1: string | number };
	'sentence.p0.p1.cards': { p0: string | number; p1: string | number };
	'sentence.p0.matched.copies.in.p1.records': { p0: string | number; p1: string | number };
	'sentence.entry.added.p0.UTC.marked.new.until.the.end.of.this.UTC.date': { p0: string | number };
	'sentence.Remove.all.p0.copies': { p0: string | number };
	'sentence.Remove.all.p0.copies.of.this.printing.finish.and.condition.This.cannot.be.undone': {
		p0: string | number;
	};
	'sentence.I.checked.the.printing.finish.condition.and.quantity.Add.p0.p1.to.inventory': {
		p0: string | number;
		p1: string | number;
	};
	'sentence.Load.more.printings.p0.of.p1': { p0: string | number; p1: string | number };
	'sentence.p0.p1.Score.p2.100': { p0: string | number; p1: string | number; p2: string | number };
	'sentence.Saved.changes.synchronization.is.p0': { p0: string | number };
	'profile.manaHelp': { examples: string | number };
	'profile.rulesHelp': { examples: string | number };
	'devices.linked': { date: string | number };
	'devices.lastSeen': { date: string | number };
	'devices.rename.aria': { name: string | number };
	'devices.revoke.aria': { name: string | number };
	'devices.revoke.title': { name: string | number };
	'imageCache.description': { maxEntries: string | number; maxSize: string | number };
	'imageCache.summary.one': { count: string | number; size: string | number };
	'imageCache.summary.other': { count: string | number; size: string | number };
	'deck.allocation.conflict': {
		owned: string | number;
		needed: string | number;
		decks: string | number;
	};
	'deck.allocation.conflict.short': { count: string | number };
	'deck.allocation.inOtherDecks': { decks: string | number };
	'deck.allocation.inOtherDecks.short': { count: string | number };
	'deck.allocation.missingAndConflict': {
		missing: string | number;
		owned: string | number;
		needed: string | number;
		decks: string | number;
	};
	'deck.allocation.missingAndInOther': {
		missing: string | number;
		decks: string | number;
	};
	'deck.allocation.summary.conflicts': { count: string | number };
	'deck.allocation.summary.inOtherDecks': { count: string | number };
	'deck.phaseRs.target': { url: string | number };
	'settings.phaseRs.help': { url: string | number };
	'playtest.pageTitle': { name: string | number };
	'playtest.counter.decrease': { counter: string | number };
	'playtest.counter.increase': { counter: string | number };
	'playtest.zone.count': { zone: string | number; count: string | number };
	'playtest.mulliganBanner.one': { mulligans: string | number; count: string | number };
	'playtest.mulliganBanner.other': { mulligans: string | number; count: string | number };
	'playtest.card.tapAria': { name: string | number; state: string | number };
	'playtest.card.playAria': { name: string | number };
	'playtest.card.moveAria': { name: string | number };
	'playtest.card.counterDecrease': { name: string | number };
	'playtest.card.counterIncrease': { name: string | number };
	'playtest.status.drew': { name: string | number };
	'playtest.status.mulliganed': { count: string | number };
}
