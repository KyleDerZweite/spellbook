import { expect, it } from 'vitest';
import { freezeReferenceEvidence } from '@spellbook/backend/valuation/read.ts';
import type { PricePublication, PriceReference } from '@spellbook/contracts/valuation.ts';

it('isolates protected evidence from mutable public DTOs and nested source facts', () => {
	const publication: PricePublication = {
		id: 'publication',
		source: 'Scryfall',
		bulkType: 'all_cards',
		sourceTime: '2026-10-07T00:00:00Z',
		timePrecision: 'Instant',
		payloadDigest: 'digest',
		extractorVersion: 3,
		mappingVersion: 1,
		ingestedAt: '2026-10-07T01:00:00Z'
	};
	const reference: Extract<PriceReference, { kind: 'Known' }> = {
		kind: 'Known',
		printingId: 'printing',
		finish: 'foil',
		amount: '0.005',
		currency: 'EUR',
		source: 'Scryfall',
		measure: 'prices.eur_foil',
		sourceTime: publication.sourceTime,
		timePrecision: 'Instant',
		freshness: 'Fresh',
		publicationId: publication.id,
		observationId: 'tuple',
		matchedPrintingId: 'english',
		matchedFinish: 'foil',
		provenance: 'EnglishFallback',
		links: [
			{
				provider: 'Cardmarket',
				url: 'https://www.cardmarket.com/actual',
				printingId: 'english',
				provenance: 'EnglishFallback'
			}
		]
	};
	const descriptor = { evidence: { dates: ['original'] } };
	const requestedIdentity = { card_faces: [{ illustration_id: 'requested-art' }] };
	const matchedIdentity = { frame_effects: ['original-effect'] };
	const evidence = freezeReferenceEvidence({
		reference,
		publication,
		descriptor,
		requestedIdentity,
		matchedIdentity,
		mappingVersion: 1,
		rawValue: '0.005'
	});
	reference.amount = '99';
	reference.links[0].url = 'https://evil.example';
	publication.sourceTime = 'relabelled';
	descriptor.evidence.dates[0] = 'relabelled';
	requestedIdentity.card_faces[0].illustration_id = 'other-art';
	matchedIdentity.frame_effects[0] = 'other-effect';
	expect(evidence).toMatchObject({
		reference: { amount: '0.005', links: [{ url: 'https://www.cardmarket.com/actual' }] },
		publication: { sourceTime: '2026-10-07T00:00:00Z' },
		descriptor: { evidence: { dates: ['original'] } },
		requestedIdentity: { card_faces: [{ illustration_id: 'requested-art' }] },
		matchedIdentity: { frame_effects: ['original-effect'] }
	});
});
