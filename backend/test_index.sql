-- Card Index SQL Generated on 2025-08-02T18:14:00.576758
-- Total cards: 5
-- Source files: oracle-cards-20250802090331.json

-- Disable foreign key checks during insert
SET session_replication_role = replica;

-- Card Index

INSERT INTO cards_index (
    scryfall_id, name, set_code, collector_number, rarity, 
    colors, type_line, mana_cost, image_url_small, oracle_id, cmc
) VALUES
(
    'a471b306-4941-4e46-a0cb-d92895c16f8a', 'Nissa, Worldsoul Speaker', 'DRC', '13', 'rare',
    'G', 'Legendary Creature — Elf Druid', '{3}{G}', 'https://cards.scryfall.io/small/front/a/4/a471b306-4941-4e46-a0cb-d92895c16f8a.jpg?1738355341', '00037840-6089-42ec-8c5c-281f9f474504', 4.0
),
(
    '86bf43b1-8d4e-4759-bb2d-0b2e03ba7012', 'Static Orb', '7ED', '319', 'rare',
    NULL, 'Artifact', '{3}', 'https://cards.scryfall.io/small/front/8/6/86bf43b1-8d4e-4759-bb2d-0b2e03ba7012.jpg?1562242171', '0004ebd0-dfd6-4276-b4a6-de0003e94237', 3.0
),
(
    '7050735c-b232-47a6-a342-01795bfd0d46', 'Sensory Deprivation', 'M14', '71', 'common',
    'U', 'Enchantment — Aura', '{U}', 'https://cards.scryfall.io/small/front/7/0/7050735c-b232-47a6-a342-01795bfd0d46.jpg?1562830795', '0006faf6-7a61-426c-9034-579f2cfcfa83', 1.0
),
(
    'e718b21b-46d1-4844-985c-52745657b1ac', 'Road of Return', 'C19', '34', 'rare',
    'G', 'Sorcery', '{G}{G}', 'https://cards.scryfall.io/small/front/e/7/e718b21b-46d1-4844-985c-52745657b1ac.jpg?1568003608', '0007c283-5b7a-4c00-9ca1-b455c8dff8c3', 2.0
),
(
    '036ef8c9-72ac-46ce-af07-83b79d736538', 'Storm Crow', '9ED', '100', 'common',
    'U', 'Creature — Bird', '{1}{U}', 'https://cards.scryfall.io/small/front/0/3/036ef8c9-72ac-46ce-af07-83b79d736538.jpg?1562730661', '000d5588-5a4c-434e-988d-396632ade42c', 2.0
)
;

-- Re-enable foreign key checks
SET session_replication_role = DEFAULT;

-- Create indexes for better search performance
CREATE INDEX IF NOT EXISTS idx_cards_index_name ON cards_index USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_cards_index_type_line ON cards_index USING gin(to_tsvector('english', type_line));
CREATE INDEX IF NOT EXISTS idx_cards_index_colors ON cards_index (colors);
CREATE INDEX IF NOT EXISTS idx_cards_index_set_code ON cards_index (set_code);
CREATE INDEX IF NOT EXISTS idx_cards_index_rarity ON cards_index (rarity);
CREATE INDEX IF NOT EXISTS idx_cards_index_cmc ON cards_index (cmc);