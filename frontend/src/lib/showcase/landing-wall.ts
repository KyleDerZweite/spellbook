import { otherTCGCards, showcaseCards, showcasePacks } from './cards.ts';
import backs from './backs.json';

export interface LandingTile {
	filename: string;
	width: number;
	height: number;
	pack: boolean;
	angle: number;
}

const tile = (asset: { slug: string; width: number; height: number }, pack = false) => ({
	filename: `${asset.slug}.webp`,
	width: asset.width,
	height: asset.height,
	pack
});
const fronts = [...showcaseCards, ...otherTCGCards].map((asset) => tile(asset));
const packs = showcasePacks.map((asset) => tile(asset, true));
const cardBacks = backs.map((asset) => tile(asset));

// One request seed drives the entire composition on both server and client.
export function createLandingWall(seed: number): { tiles: LandingTile[]; rotation: number } {
	let state = seed >>> 0;
	const random = () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
		return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
	};
	const special = random() < 0.01;
	const rotation = [12, 14, 16][Math.floor(random() * 3)];
	const tiles: LandingTile[] = [];
	for (let index = 0; index < 36; index++) {
		const category = random();
		const pool = category < 0.75 ? fronts : category < 0.9 ? packs : cardBacks;
		const adjacent = [tiles[index - 1]?.filename, tiles[index - 6]?.filename];
		const alternatives = pool.filter((tile) => !adjacent.includes(tile.filename));
		const choices = alternatives.length ? alternatives : pool;
		tiles.push({
			...choices[Math.floor(random() * choices.length)],
			angle: Math.round((random() * 4 - 2) * 10) / 10
		});
	}
	if (special) {
		// Keep the local artwork within the central, visible portion of the wall.
		const index = [8, 9, 14, 15][Math.floor(random() * 4)];
		tiles[index] = {
			filename: 'spellbook.svg',
			width: 560,
			height: 780,
			pack: false,
			angle: tiles[index].angle
		};
	}
	return { tiles, rotation };
}
