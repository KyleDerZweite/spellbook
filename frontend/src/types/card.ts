export interface CardSet {
  id: string
  code: string
  name: string
  release_date?: string
  card_count?: number
  icon_url?: string
  metadata?: Record<string, any>
}

export interface Card {
  id: string
  scryfall_id?: string
  oracle_id?: string
  name: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  power?: string
  toughness?: string
  colors?: string
  color_identity?: string
  rarity?: string
  flavor_text?: string
  artist?: string
  collector_number?: string
  image_uris?: {
    small?: string
    normal?: string
    large?: string
    art_crop?: string
    border_crop?: string
  }
  prices?: {
    usd?: string
    usd_foil?: string
    eur?: string
    eur_foil?: string
  }
  legalities?: Record<string, string>
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
  set?: CardSet
}

export interface CardSearchParams {
  q?: string
  colors?: string
  set?: string
  rarity?: string
  type?: string
  page?: number
  per_page?: number
}

export interface CardSearchResponse {
  data: Card[]
  meta: {
    total: number
    page: number
    per_page: number
    total_pages: number
    has_next: boolean
    has_prev: boolean
  }
}

export interface UserCard {
  id: string
  user_id: string
  card: Card
  quantity: number
  foil_quantity: number
  condition: string
  language: string
  purchase_price?: number
  purchase_date?: string
  notes?: string
  tags?: string[]
  created_at: string
  updated_at: string
}

export interface CollectionStats {
  total_cards: number
  unique_cards: number
  total_value: number
  sets_collected: number
  rarity_breakdown: Record<string, number>
  color_breakdown: Record<string, number>
}