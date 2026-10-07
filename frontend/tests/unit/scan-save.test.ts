import { describe, it, expect } from 'vitest';
import { createScanSave } from '#lib/scan/save.ts';
import type { ScanCommitAcknowledgement, ScanSessionResult } from '@spellbook/contracts/scan.ts';
describe('confirmed Scan save read recovery', () => {
	it('retains original acknowledgement across failed current reads and never resends confirmed quantity', async () => {
		const acknowledgement: ScanCommitAcknowledgement = {
			kind: 'Committed',
			sessionId: 'selected',
			acknowledgement: {
				requestId: 'original',
				inventoryId: null,
				revision: '7',
				changes: [],
				removedEntryIds: [],
				groups: [],
				removedGroupIds: [],
				memberships: []
			}
		};
		const current: ScanSessionResult = {
			session: {
				id: 'selected',
				game: 'mtg',
				status: 'committed',
				createdAt: '2026-10-07T00:00:00Z',
				updatedAt: '2026-10-07T00:00:01Z'
			},
			artifacts: [],
			reviewItems: [],
			artifactCount: 0,
			reviewCount: 1,
			nextArtifactCursor: null,
			nextReviewCursor: null,
			lastResult: null
		};
		let posts = 0,
			reads = 0;
		const saved = createScanSave({
			commit: async () => {
				posts++;
				return acknowledgement;
			},
			read: async (id) => {
				reads++;
				expect(id).toBe('selected');
				if (reads === 1) throw Error('Current read unavailable');
				return current;
			}
		});
		expect(await saved.commit('immutable-body')).toBe(acknowledgement);
		await expect(saved.read()).rejects.toThrow('Current read unavailable');
		expect(saved.acknowledgement).toBe(acknowledgement);
		expect(await saved.commit('a different body after confirmation')).toBe(acknowledgement);
		expect(await saved.read()).toBe(current);
		expect(posts).toBe(1);
		expect(reads).toBe(2);
	});
});
