import type { CardDocument } from '#lib/search/types.ts';

/** Minimal offline identity; the inspector hydrates rules and printing metadata from the catalog. */
export function storedCardDocument(card: {
	catalogCardId: string;
	canonicalCardId: string;
	name: string;
	setCode: string;
	imageUri: string;
}): CardDocument {
	return {
		id: card.catalogCardId,
		oracle_id: card.canonicalCardId,
		name: card.name,
		set_code: card.setCode,
		image_uri: card.imageUri,
		image_uri_small: card.imageUri,
		set_name: card.setCode.toUpperCase(),
		lang: 'en',
		released_at: '',
		layout: '',
		mana_cost: '',
		cmc: 0,
		type_line: '',
		oracle_text: '',
		colors: [],
		color_identity: [],
		keywords: [],
		card_types: [],
		rarity: '',
		collector_number: '',
		is_foil_available: false,
		is_nonfoil_available: false,
		legalities: {}
	};
}
