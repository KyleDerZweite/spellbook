import type { ScanCommitAcknowledgement, ScanSessionResult } from '@spellbook/contracts/scan.ts';
/** Confirmed writes and recoverable current reads have separate lifetimes. */
export function createScanSave(transport: {
	commit(body: string): Promise<ScanCommitAcknowledgement>;
	read(sessionId: string): Promise<ScanSessionResult>;
}) {
	let acknowledgement: ScanCommitAcknowledgement | null = null;
	return {
		get acknowledgement() {
			return acknowledgement;
		},
		async commit(body: string) {
			if (acknowledgement?.kind === 'Committed') return acknowledgement;
			acknowledgement = await transport.commit(body);
			return acknowledgement;
		},
		async read() {
			if (acknowledgement?.kind !== 'Committed')
				throw new Error('A confirmed Scan save is required');
			return transport.read(acknowledgement.sessionId);
		}
	};
}
