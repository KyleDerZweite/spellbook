export type ID = string;

export interface ApiListMeta {
  total?: number;
  page?: number;
  per_page?: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: ApiListMeta;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface User {
  id: ID;
  email: string;
  username: string;
  is_active: boolean;
  is_admin: boolean;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  preferences?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
  last_login_at?: string;
}

export interface CardIndexItem {
  id: ID;
  scryfall_id: ID;
  name: string;
  type_line: string;
  colors?: string[];
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic';
  set_code?: string;
  image_uris?: { 
    small?: string; 
    normal?: string; 
    large?: string;
    art_crop?: string;
    border_crop?: string;
  };
}

export interface Card extends CardIndexItem {
  oracle_id?: ID;
  mana_cost?: string;
  cmc?: number;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  color_identity?: string[];
  flavor_text?: string;
  artist?: string;
  collector_number?: string;
  prices?: Record<string, string | null>;
  legalities?: Record<string, string>;
  set?: {
    id: ID;
    code: string;
    name: string;
    release_date?: string;
  };
  version_count?: number;
  extra_data?: Record<string, any>;
}

export interface UserCard {
  id: ID;
  user_id: ID;
  card_id: ID;
  card?: Card;
  quantity: number;
  foil_quantity?: number;
  condition?: 'mint' | 'near_mint' | 'excellent' | 'good' | 'light_played' | 'played' | 'poor';
  language?: string;
  purchase_price?: string;
  current_price?: string;
  tags?: string[];
  notes?: string;
  added_at: string;
}

export interface CollectionStats {
  total_cards: number;
  unique_cards: number;
  total_value?: number;
  sets_collected?: number;
  completion_percent?: number;
  rarity_breakdown?: Record<string, number>;
  color_breakdown?: Record<string, number>;
}

export interface CardSearchParams {
  q?: string;
  colors?: string[];
  type_line?: string;
  types?: string[];
  set_code?: string[];
  rarity?: string[];
  page?: number;
  per_page?: number;
}

export interface Deck {
  id: ID;
  name: string;
  format?: string;
  colors?: string;
  description?: string;
  tags?: string[];
  card_count: number;
  sideboard_count?: number;
  value?: number;
  created_at: string;
  updated_at: string;
}

export interface DeckCard {
  id: ID;
  deck_id: ID;
  card_id: ID;
  card?: Card;
  quantity: number;
  is_sideboard: boolean;
  category?: string;
}

export interface Invite {
  id: ID;
  code: string;
  email_restriction?: string;
  max_uses: number;
  current_uses: number;
  expires_at?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'DISABLED';
  created_by: ID;
  created_at: string;
}

export interface ApiError {
  message: string;
  type: string;
  details?: Record<string, any>;
}