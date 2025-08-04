export interface Card {
  id: string;
  scryfall_id?: string;
  oracle_id?: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  colors?: string;
  color_identity?: string;
  rarity?: string;
  flavor_text?: string;
  artist?: string;
  collector_number?: string;
  image_uris?: Record<string, any>;
  prices?: Record<string, any>;
  legalities?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  set?: CardSet;
}

export interface CardSet {
  id: string;
  code: string;
  name: string;
  set_name?: string;
  release_date?: string;
  card_count?: number;
  icon_url?: string;
  metadata?: Record<string, any>;
}

export interface SearchFilters {
  colors?: string;
  set?: string;
  rarity?: string;
  type?: string;
}

export interface CardSearchResponse {
  data: Card[];
  meta: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export interface User {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  is_admin: boolean;
  preferences: Record<string, any>;
  created_at: string;
  last_login_at?: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  owner_id: string;
}

export interface CollectionCard {
  id: string;
  card: Card;
  quantity: number;
  condition?: string;
  is_foil?: boolean;
  added_at: string;
}
