import cards from './cards.json';
import otherCards from './other-tcg-cards.json';

export interface ShowcaseCard {
	id: string;
	slug: string;
	name: string;
	set: string;
	setName: string;
	collectorNumber: string;
	type: string;
	mana: string;
	artist: string;
	source: string;
	metadataSource: string;
	imageSource: string;
	width: number;
	height: number;
	refreshedOn: string;
}

export const showcaseCards: readonly ShowcaseCard[] = cards;

export interface OtherTCGCard {
	id: string;
	slug: string;
	name: string;
	game: string;
	source: string;
	metadataSource: string;
	imageSource: string;
	width: number;
	height: number;
	refreshedOn?: string;
}

export const otherTCGCards: readonly OtherTCGCard[] = otherCards;
