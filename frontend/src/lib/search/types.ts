export interface CardDocument {
  id: string;
  oracle_id: string;
  name: string;
  lang: string;
  released_at: string;
  layout: string;
  mana_cost: string;
  cmc: number;
  type_line: string;
  oracle_text: string;
  colors: string[];
  color_identity: string[];
  keywords: string[];
  power: string;
  toughness: string;
  rarity: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  image_uri: string;
  image_uri_small: string;
  is_foil_available: boolean;
  is_nonfoil_available: boolean;
  legalities: Record<string, string>;
  back_face_name?: string;
  back_face_image_uri?: string;
}

export interface SearchResult {
  hits: CardDocument[];
  query: string;
  processingTimeMs: number;
  estimatedTotalHits?: number;
}
