import type { AuthUser } from './auth.ts';
import type { ProfileTotals, SummaryFailure } from './profile.ts';
export interface DashboardDistribution {
	label: string;
	quantity: number;
	share: number;
}
export interface DashboardRecentEntry {
	id: string;
	catalogCardId: string;
	canonicalCardId: string;
	name: string;
	setCode: string;
	imageUri: string;
	quantity: number;
	finish: string;
	condition: string;
	updatedAt: string;
}
export interface DashboardDeck {
	id: string;
	name: string;
	format: string;
	required: number;
	exact: number;
	alternate: number;
	missing: number;
}
export interface DashboardSummary {
	totals: ProfileTotals;
	sets: DashboardDistribution[];
	finishes: DashboardDistribution[];
	conditions: DashboardDistribution[];
	recentEntries: DashboardRecentEntry[];
	decks: DashboardDeck[];
	pendingScanReviews: number | null;
}
export interface DashboardApplication {
	get(actor: AuthUser): Promise<DashboardSummary>;
}

export type DashboardFailure = SummaryFailure | { kind: 'Unauthenticated'; message: string };
