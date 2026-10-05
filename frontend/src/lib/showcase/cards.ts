import cards from './cards.json';
import otherCards from './other-tcg-cards.json';
import packs from './packs.json';

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

export interface ShowcasePack {
	slug: string;
	name: string;
	game: string;
	set: string;
	setName: string;
	source: string;
	imageSource: string;
	width: number;
	height: number;
	sourceWidth: number;
	sourceHeight: number;
	refreshedOn?: string;
}

export const showcasePacks: readonly ShowcasePack[] = packs;
