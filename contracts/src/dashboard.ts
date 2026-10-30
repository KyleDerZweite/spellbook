import type {
  CurrentInventoryValue,
  InventoryValueHistory,
} from "./inventory-value.ts";
import type { AuthUser } from "./auth.ts";
import type { ProfileTotals, SummaryFailure } from "./profile.ts";
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
  /** At most two stored Commander-role Printing previews, not the full Deck composition. */
  commanders: { catalogCardId: string; name: string; imageUri: string }[];
}
/** Mutually exclusive, quantity-weighted Inventory buckets from the active Catalog. */
export interface DashboardCatalogBreakdown {
  colors: DashboardDistribution[];
  colorIdentity: DashboardDistribution[];
  rarities: DashboardDistribution[];
  primaryTypes: DashboardDistribution[];
  matchedQuantity: number;
  unknownQuantity: number;
  setNames: Record<string, string>;
}
/** One Canonical Card requirement within one Deck, not distinct owned Inventory. */
export interface DashboardRequirement {
  deckId: string;
  deckName: string;
  canonicalCardId: string;
  catalogCardId: string;
  name: string;
  imageUri: string;
  required: number;
  exact: number;
  alternate: number;
  missing: number;
}
export interface DashboardRequirementPreviews {
  missing: DashboardRequirement[];
  alternate: DashboardRequirement[];
}
export interface DashboardSummary {
  totals: ProfileTotals;
  catalogBreakdown: DashboardCatalogBreakdown | null;
  requirements: DashboardRequirementPreviews;
  sets: DashboardDistribution[];
  finishes: DashboardDistribution[];
  conditions: DashboardDistribution[];
  recentEntries: DashboardRecentEntry[];
  decks: DashboardDeck[];
  pendingScanReviews: number | null;
  inventoryValue: CurrentInventoryValue | null;
  inventoryValueHistory: InventoryValueHistory | null;
  valuationError: { kind: "PriceReadUnavailable"; message: string } | null;
}
export interface DashboardApplication {
  get(actor: AuthUser): Promise<DashboardSummary>;
}

export type DashboardFailure =
  SummaryFailure | { kind: "Unauthenticated"; message: string };
