import { describe, expect, it } from 'vitest';
import { createLandingWall } from '#lib/showcase/landing-wall.ts';
import { showcasePacks, showcaseCards, otherTCGCards } from '#lib/showcase/cards.ts';
import backs from '#lib/showcase/backs.json';

describe('landing decoration', () => {
	it('reconstructs the same bounded composition from serialized request data', () => {
		const seed = 4294967295;
		const server = createLandingWall(seed);
		const client = createLandingWall(JSON.parse(JSON.stringify({ seed })).seed);
		expect(client).toEqual(server);
		expect(server.tiles).toHaveLength(36);
		expect(createLandingWall(123)).not.toEqual(server);
		expect(server.tiles.every((tile) => Math.abs(tile.angle) <= 2)).toBe(true);
		expect([12, 14, 16]).toContain(server.rotation);
	});

	it('avoids repeating the same front or pack beside an adjacent tile', () => {
		const backNames = new Set(backs.map((back) => `${back.slug}.webp`));
		for (let seed = 0; seed < 100; seed++) {
			const { tiles } = createLandingWall(seed);
			for (const [index, tile] of tiles.entries()) {
				if (backNames.has(tile.filename)) continue;
				expect(tile.filename).not.toBe(tiles[index - 1]?.filename);
				expect(tile.filename).not.toBe(tiles[index - 6]?.filename);
			}
		}
	});

	it('samples ordinary fronts, packs and backs at the requested weights', () => {
		const frontNames = new Set(
			[...showcaseCards, ...otherTCGCards].map((card) => `${card.slug}.webp`)
		);
		const packNames = new Set(showcasePacks.map((pack) => `${pack.slug}.webp`));
		const backNames = new Set(backs.map((back) => `${back.slug}.webp`));
		let front = 0,
			pack = 0,
			back = 0,
			special = 0;
		for (let seed = 0; seed < 10000; seed++) {
			const wall = createLandingWall(seed);
			const hiddenCards = wall.tiles.filter((tile) => tile.filename === 'spellbook.svg');
			expect(hiddenCards.length).toBeLessThanOrEqual(1);
			if (hiddenCards.length) special++;
			for (const tile of wall.tiles) {
				if (frontNames.has(tile.filename)) front++;
				else if (packNames.has(tile.filename)) {
					pack++;
					expect(tile.pack).toBe(true);
				} else if (backNames.has(tile.filename)) {
					back++;
					expect(tile.pack).toBe(false);
				} else expect(tile.filename).toBe('spellbook.svg');
			}
		}
		const ordinary = front + pack + back;
		expect(front / ordinary).toBeCloseTo(0.75, 2);
		expect(pack / ordinary).toBeCloseTo(0.15, 2);
		expect(back / ordinary).toBeCloseTo(0.1, 2);
		expect(special / 10000).toBeGreaterThan(0.007);
		expect(special / 10000).toBeLessThan(0.013);
	});
});
