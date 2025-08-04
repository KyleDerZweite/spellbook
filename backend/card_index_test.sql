-- Card Index SQL Generated on 2025-08-02T18:03:11.517011
-- Total cards: 100
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
),
(
    'b125d1e7-5d9b-4997-88b0-71bdfc19c6f2', 'Walking Sponge', 'ULG', '47', 'uncommon',
    'U', 'Creature — Sponge', '{1}{U}', 'https://cards.scryfall.io/small/front/b/1/b125d1e7-5d9b-4997-88b0-71bdfc19c6f2.jpg?1562863790', '000e5d65-96c3-498b-bd01-72b1a1991850', 2.0
),
(
    'e0f83824-43c6-4101-88fd-9109958b23e2', 'Ravnica at War', 'WAR', '28', 'rare',
    'W', 'Sorcery', '{3}{W}', 'https://cards.scryfall.io/small/front/e/0/e0f83824-43c6-4101-88fd-9109958b23e2.jpg?1557576051', '0012bc78-e69d-4a67-a302-e5fe0dfd4407', 4.0
),
(
    '2cfd365e-34d1-4224-b925-119000311934', 'Greta, Sweettooth Scourge', 'WOE', '205', 'uncommon',
    'BG', 'Legendary Creature — Human Warrior', '{1}{B}{G}', 'https://cards.scryfall.io/small/front/2/c/2cfd365e-34d1-4224-b925-119000311934.jpg?1692939325', '00173df7-a584-410c-af1d-ada9c791056a', 3.0
),
(
    'feeee859-f64a-4cd8-be0b-ad60cff8812e', 'Torrent of Fire', 'SCG', '107', 'common',
    'R', 'Sorcery', '{3}{R}{R}', 'https://cards.scryfall.io/small/front/f/e/feeee859-f64a-4cd8-be0b-ad60cff8812e.jpg?1744334031', '00181784-9213-492a-ba8c-2028969b049e', 5.0
),
(
    '0072bbbf-a695-47dd-9615-db2659f357db', 'Pteramander', 'OTC', '109', 'uncommon',
    'U', 'Creature — Salamander Drake', '{U}', 'https://cards.scryfall.io/small/front/0/0/0072bbbf-a695-47dd-9615-db2659f357db.jpg?1712354189', '00187de2-bc48-4137-97d8-a9a0fafc76c1', 1.0
),
(
    '625a41c8-0b5a-4738-afa6-db847d043c88', 'Brightglass Gearhulk // Brightglass Gearhulk', 'ADFT', '53', 'common',
    NULL, 'Card // Card', NULL, NULL, '0019beff-1528-4131-ae21-9e7a3cf7fbfb', 0
),
(
    '5c0a4e6e-cc4e-43d5-aece-f009e117366a', 'Nantuko Elder', 'ODY', '254', 'uncommon',
    'G', 'Creature — Insect Druid', '{2}{G}', 'https://cards.scryfall.io/small/front/5/c/5c0a4e6e-cc4e-43d5-aece-f009e117366a.jpg?1562911994', '001c233f-2959-479b-a82a-64a25ac60830', 3.0
),
(
    '5ab2ba75-e52e-46f5-8a34-3fe1e07446fd', 'Vedalken Heretic', 'ARB', '104', 'rare',
    'GU', 'Creature — Vedalken Rogue', '{G}{U}', 'https://cards.scryfall.io/small/front/5/a/5ab2ba75-e52e-46f5-8a34-3fe1e07446fd.jpg?1562641484', '001c6369-df13-427d-89df-718d5c09f382', 2.0
),
(
    'ada68b91-3379-483e-93a0-b6c7c675c1dc', 'Waterknot', 'JMP', '192', 'common',
    'U', 'Enchantment — Aura', '{1}{U}{U}', 'https://cards.scryfall.io/small/front/a/d/ada68b91-3379-483e-93a0-b6c7c675c1dc.jpg?1600699101', '002100cd-1ab1-44da-93a0-1269d47a712a', 3.0
),
(
    '1ce91e38-4601-4354-ad1b-2c5c1c70da17', 'Ruthless Knave', 'XLN', '119', 'uncommon',
    'B', 'Creature — Orc Pirate', '{2}{B}', 'https://cards.scryfall.io/small/front/1/c/1ce91e38-4601-4354-ad1b-2c5c1c70da17.jpg?1562551661', '00225c40-27ff-410f-a591-5c788c6a2bd6', 3.0
),
(
    'bea12617-ebaa-45f6-a2e8-b71190708129', 'Phyrexian Broodstar', 'UNK', 'RU08', 'rare',
    'U', 'Creature — Phyrexian Beast', '{6}{U}{U}', 'https://cards.scryfall.io/small/front/b/e/bea12617-ebaa-45f6-a2e8-b71190708129.jpg?1727365378', '00268072-af77-40d2-8d2d-c02426575ee1', 8.0
),
(
    '8bbdc7c5-71a1-4db8-98b2-8883bf648dca', 'Hua Tuo, Honored Physician', 'C13', '149', 'rare',
    'G', 'Legendary Creature — Human', '{1}{G}{G}', 'https://cards.scryfall.io/small/front/8/b/8bbdc7c5-71a1-4db8-98b2-8883bf648dca.jpg?1562924564', '00284955-0a1b-4939-9567-a7d34cbcee51', 3.0
),
(
    'aa686c34-1c11-469f-93c2-f9891aea521f', 'Veil of Summer', 'M20', '198', 'uncommon',
    'G', 'Instant', '{G}', 'https://cards.scryfall.io/small/front/a/a/aa686c34-1c11-469f-93c2-f9891aea521f.jpg?1650599837', '002965be-a36f-4a09-9ce0-c6535bca1703', 1.0
),
(
    'ad806d67-4c98-438b-859f-b1358281e09d', 'Disposal Mummy', 'HOU', '9', 'common',
    'W', 'Creature — Zombie Jackal', '{2}{W}', 'https://cards.scryfall.io/small/front/a/d/ad806d67-4c98-438b-859f-b1358281e09d.jpg?1562810537', '002a9cea-8cf7-48ba-83eb-e1c87a7024e5', 3.0
),
(
    '491a3dc5-d297-47e1-acf9-dda103136519', 'Marang River Prowler', 'ZNC', '29', 'uncommon',
    'U', 'Creature — Human Rogue', '{2}{U}', 'https://cards.scryfall.io/small/front/4/9/491a3dc5-d297-47e1-acf9-dda103136519.jpg?1604192521', '002e767c-0b30-4ad1-a924-88da400a4cff', 3.0
),
(
    '55552a2b-1861-4235-a60d-ccabb4839d54', 'Aura Graft', '10E', '67', 'uncommon',
    'U', 'Instant', '{1}{U}', 'https://cards.scryfall.io/small/front/5/5/55552a2b-1861-4235-a60d-ccabb4839d54.jpg?1562547914', '00317e4f-0228-469a-9789-fb6c39976860', 2.0
),
(
    '740564ec-c473-45bc-ba94-288786bf28b9', 'Murk Dwellers', '5ED', '180', 'common',
    'B', 'Creature — Zombie', '{3}{B}', 'https://cards.scryfall.io/small/front/7/4/740564ec-c473-45bc-ba94-288786bf28b9.jpg?1562591833', '00358a89-2058-448b-a2fd-389f639ba2da', 4.0
),
(
    '5fbfdc2a-7bf3-4461-bef7-fa499d29d1b8', 'Whispering Shade', 'ODY', '167', 'common',
    'B', 'Creature — Shade', '{3}{B}', 'https://cards.scryfall.io/small/front/5/f/5fbfdc2a-7bf3-4461-bef7-fa499d29d1b8.jpg?1562912658', '0036d062-10dc-4267-98b4-1d2f6b190a61', 4.0
),
(
    '7d09f247-99c6-4038-9cd1-7c4ccc3d7005', 'Wall of Fortune', 'UND', '30', 'common',
    'U', 'Artifact Creature — Wall', '{1}{U}', 'https://cards.scryfall.io/small/front/7/d/7d09f247-99c6-4038-9cd1-7c4ccc3d7005.jpg?1583965503', '00378902-90f3-465a-b917-23c0e81a7400', 2.0
),
(
    '4cdfb468-e475-47e6-80f5-190c9b206e70', 'Saheeli''s Artistry', 'MOC', '234', 'rare',
    'U', 'Sorcery', '{4}{U}{U}', 'https://cards.scryfall.io/small/front/4/c/4cdfb468-e475-47e6-80f5-190c9b206e70.jpg?1682208874', '0038e74a-b950-47ff-8853-dba6a3b31091', 6.0
),
(
    'f477e57d-e391-4732-88c9-aec6598231c7', 'Gigantosaurus // Gigantosaurus', 'AFDN', '53', 'common',
    NULL, 'Card // Card', NULL, NULL, '0039b18c-5b82-4334-b3bd-0232fca57303', 0
),
(
    '859aab70-8192-414c-839b-dd0fbcbd8bf1', 'Kalitas, Bloodchief of Ghet', 'ZEN', '99', 'mythic',
    'B', 'Legendary Creature — Vampire Warrior', '{5}{B}{B}', 'https://cards.scryfall.io/small/front/8/5/859aab70-8192-414c-839b-dd0fbcbd8bf1.jpg?1562614015', '003bf21f-6815-4098-a186-aa15f5947541', 7.0
),
(
    '61edb39b-ff82-4568-971f-baf22e209c88', 'Safewright Quest', 'SHM', '240', 'common',
    'GW', 'Sorcery', '{G/W}', 'https://cards.scryfall.io/small/front/6/1/61edb39b-ff82-4568-971f-baf22e209c88.jpg?1562830841', '003c48d4-0303-4970-8637-47ae060385aa', 1.0
),
(
    '2fc7946d-37b0-4dc8-9daa-8d2204d8e4d2', 'Seedship Agrarian', 'EOE', '204', 'uncommon',
    'G', 'Creature — Insect Scientist', '{3}{G}', 'https://cards.scryfall.io/small/front/2/f/2fc7946d-37b0-4dc8-9daa-8d2204d8e4d2.jpg?1752947386', '003d9c17-5d5c-469f-ad87-d78faf55e025', 4.0
),
(
    'a7a14b58-e0d9-4203-a9da-ad8e997a7936', 'Instill Infection', 'MM2', '85', 'common',
    'B', 'Instant', '{3}{B}', 'https://cards.scryfall.io/small/front/a/7/a7a14b58-e0d9-4203-a9da-ad8e997a7936.jpg?1562265741', '0040db73-ac11-4c15-a1ac-5a2c4c085f09', 4.0
),
(
    '97fde010-c75b-4e5f-82e2-6dc1c5dfe1a4', 'Gleeful Demolition // Gleeful Demolition', 'AONE', '28', 'common',
    NULL, 'Card // Card', NULL, NULL, '0044144e-b848-43c4-b77c-013017b7d5c8', 0
),
(
    '87aab031-4e44-44cd-89a7-6cffc7288cd1', 'Strength of Night', 'APC', '86', 'common',
    'G', 'Instant', '{2}{G}', 'https://cards.scryfall.io/small/front/8/7/87aab031-4e44-44cd-89a7-6cffc7288cd1.jpg?1562927017', '0045cf16-86dd-4417-ae36-88ca63b30c26', 3.0
),
(
    '2399c6d7-57f9-4100-ad64-3c8897a438f7', 'High-Rise Sawjack', 'SNC', '150', 'common',
    'G', 'Creature — Elf Citizen', '{2}{G}', 'https://cards.scryfall.io/small/front/2/3/2399c6d7-57f9-4100-ad64-3c8897a438f7.jpg?1664412339', '0049438b-e37e-4c57-820e-f2ddf3322170', 3.0
),
(
    'b0e90b22-6f43-4e9a-a236-f33191768813', 'Spike, Tournament Grinder', 'UST', '69', 'rare',
    'B', 'Legendary Creature — Human Gamer', '{2}{B/P}{B/P}', 'https://cards.scryfall.io/small/front/b/0/b0e90b22-6f43-4e9a-a236-f33191768813.jpg?1562932337', '004b2032-0d29-4361-b9c8-a3c0c7b63e2c', 4.0
),
(
    '884c47fa-7060-48da-995c-e4037640a208', 'Keldon Raider', 'M20', '146', 'common',
    'R', 'Creature — Human Warrior', '{2}{R}{R}', 'https://cards.scryfall.io/small/front/8/8/884c47fa-7060-48da-995c-e4037640a208.jpg?1592516981', '004f82f0-74cc-4bc7-ab22-ab1a5247bc29', 4.0
),
(
    '91df110f-85d2-41cb-96b6-6c79cebfada7', 'Leopard-Spotted Jiao', 'GS1', '23', 'common',
    'R', 'Creature — Beast', '{1}{R}', 'https://cards.scryfall.io/small/front/9/1/91df110f-85d2-41cb-96b6-6c79cebfada7.jpg?1562131600', '0056e07b-416b-487e-9e6c-3697db402dd4', 2.0
),
(
    'a0335da5-d754-480d-89d9-be6b8ca33fda', 'Escape Tunnel', 'EOC', '157', 'common',
    NULL, 'Land', NULL, 'https://cards.scryfall.io/small/front/a/0/a0335da5-d754-480d-89d9-be6b8ca33fda.jpg?1752945301', '0056fc91-4398-471c-b561-7ff99750ac8a', 0
),
(
    '1a7cc43c-6e8c-41d2-a885-24604dfc7e7f', 'Food Fight', 'WOE', '129', 'rare',
    'R', 'Enchantment', '{1}{R}', 'https://cards.scryfall.io/small/front/1/a/1a7cc43c-6e8c-41d2-a885-24604dfc7e7f.jpg?1692938205', '00571e7f-4e40-4a07-a529-34580e942338', 2.0
),
(
    '179461b8-0a6b-48c5-9d1f-db8bcfecc6f9', 'Behemoth Sledge', 'AFC', '180', 'uncommon',
    'GW', 'Artifact — Equipment', '{1}{G}{W}', 'https://cards.scryfall.io/small/front/1/7/179461b8-0a6b-48c5-9d1f-db8bcfecc6f9.jpg?1631588382', '00573e77-8ff6-4acb-8683-8827d965288f', 3.0
),
(
    'caf28377-d831-4100-9843-d9f5db019791', 'Tatsunari, Toad Rider // Tatsunari, Toad Rider', 'ANEO', '60', 'common',
    NULL, 'Card // Card', NULL, NULL, '005a8822-73ae-4953-9b46-a485e92df1b3', 0
),
(
    'f01f12e0-f354-43aa-9e2d-b59a99571a5f', 'Toluz, Clever Conductor', 'SNC', '228', 'rare',
    'BUW', 'Legendary Creature — Human Rogue', '{W/U}{U}{U/B}', 'https://cards.scryfall.io/small/front/f/0/f01f12e0-f354-43aa-9e2d-b59a99571a5f.jpg?1664413901', '005c181a-05db-4c15-9893-65103cca338e', 3.0
),
(
    '8d264ad1-10a3-41ba-9740-48f2c07a0ec3', 'Kindred Discovery', 'LCC', '159', 'rare',
    'U', 'Enchantment', '{3}{U}{U}', 'https://cards.scryfall.io/small/front/8/d/8d264ad1-10a3-41ba-9740-48f2c07a0ec3.jpg?1698988160', '005ee549-1bf5-478f-bc3f-3e791bd7eecf', 5.0
),
(
    '18fbfbc0-c55b-4e56-a3d2-5d09571c36c8', 'Stern Marshal', 'POR', '32', 'rare',
    'W', 'Creature — Human Soldier', '{2}{W}', 'https://cards.scryfall.io/small/front/1/8/18fbfbc0-c55b-4e56-a3d2-5d09571c36c8.jpg?1562445679', '00602959-e9a1-4706-a1cb-70156a6fc713', 3.0
),
(
    'b2c280c8-3471-4ae1-be96-0f392b095ce2', 'Trapjaw Tyrant', 'RIX', '29', 'mythic',
    'W', 'Creature — Dinosaur', '{3}{W}{W}', 'https://cards.scryfall.io/small/front/b/2/b2c280c8-3471-4ae1-be96-0f392b095ce2.jpg?1555039837', '00605b83-faf6-4779-be9d-6a2c8f0ea722', 5.0
),
(
    '1a9d4ff8-af35-413f-9aa2-f4c6e34fade2', 'Strength of Unity', 'INV', '40', 'common',
    'W', 'Enchantment — Aura', '{3}{W}', 'https://cards.scryfall.io/small/front/1/a/1a9d4ff8-af35-413f-9aa2-f4c6e34fade2.jpg?1562900233', '00606d5e-a134-4363-9ee6-05e03d58f234', 4.0
),
(
    '748e6a61-9c1f-4225-9f04-e54002f63ac3', 'Savai Triome', 'IKO', '253', 'rare',
    NULL, 'Land — Mountain Plains Swamp', NULL, 'https://cards.scryfall.io/small/front/7/4/748e6a61-9c1f-4225-9f04-e54002f63ac3.jpg?1591228681', '00625242-9348-4ef4-b975-f2ac82fee21d', 0
),
(
    '2e0c6628-04f1-4800-baa8-bcaefe64f59f', 'Warden of the First Tree', 'FRF', '143', 'mythic',
    'G', 'Creature — Human', '{G}', 'https://cards.scryfall.io/small/front/2/e/2e0c6628-04f1-4800-baa8-bcaefe64f59f.jpg?1562823823', '0068a341-92a5-470e-a565-9ace69eb04a8', 1.0
),
(
    '5b71c6bd-db67-46ca-9c96-119e89f8ef69', 'Thunderherd Migration', 'LCC', '259', 'uncommon',
    'G', 'Sorcery', '{1}{G}', 'https://cards.scryfall.io/small/front/5/b/5b71c6bd-db67-46ca-9c96-119e89f8ef69.jpg?1698988406', '006bbd8b-2007-419d-8b84-9ff73f2f95b7', 2.0
),
(
    'd753c296-8cef-492d-ab41-e7ddb233d46e', 'One with the Kami', 'NEC', '27', 'rare',
    'G', 'Enchantment — Aura', '{3}{G}', 'https://cards.scryfall.io/small/front/d/7/d753c296-8cef-492d-ab41-e7ddb233d46e.jpg?1651655426', '006f4a62-8590-4ca0-9f51-3aea26cd1a54', 4.0
),
(
    'c086eb41-3524-4815-97c9-761ba86a30b2', 'Carnage Wurm', 'M12', '168', 'uncommon',
    'G', 'Creature — Wurm', '{6}{G}', 'https://cards.scryfall.io/small/front/c/0/c086eb41-3524-4815-97c9-761ba86a30b2.jpg?1562658159', '007161cb-a44b-4443-a53a-dfaacc6cfb86', 7.0
),
(
    '4849db5d-cd41-49f6-acd5-697cdc8263f6', 'Goblin Barrage', 'DOM', '128', 'uncommon',
    'R', 'Sorcery', '{3}{R}', 'https://cards.scryfall.io/small/front/4/8/4849db5d-cd41-49f6-acd5-697cdc8263f6.jpg?1562735067', '0071723e-388d-4ae7-bc99-c143dd356c63', 4.0
),
(
    'cba131bb-b8b3-4577-9f41-4700d9985134', 'Dungeon Delver', 'CLB', '67', 'uncommon',
    'U', 'Legendary Enchantment — Background', '{1}{U}', 'https://cards.scryfall.io/small/front/c/b/cba131bb-b8b3-4577-9f41-4700d9985134.jpg?1674135502', '0073d731-e60d-433a-ac35-a22af855da20', 2.0
),
(
    'd3f990e7-54a3-4893-8510-645b2065447b', 'Errand-Rider of Gondor', 'LTR', '11', 'common',
    'W', 'Creature — Human Soldier', '{2}{W}', 'https://cards.scryfall.io/small/front/d/3/d3f990e7-54a3-4893-8510-645b2065447b.jpg?1686967733', '00749bad-dded-4fec-bf34-ff14cf561c26', 3.0
),
(
    '5deaa491-d95b-481f-aa47-8e7219174cc5', 'Pharika''s Mender', 'CN2', '205', 'uncommon',
    'BG', 'Creature — Gorgon', '{3}{B}{G}', 'https://cards.scryfall.io/small/front/5/d/5deaa491-d95b-481f-aa47-8e7219174cc5.jpg?1576383214', '00771a33-7443-43f9-a61e-1737b62b1f81', 5.0
),
(
    '7d77ddcc-e66b-4036-8a55-ec42953918d1', 'Mind Extraction', 'APC', '42', 'common',
    'B', 'Sorcery', '{2}{B}', 'https://cards.scryfall.io/small/front/7/d/7d77ddcc-e66b-4036-8a55-ec42953918d1.jpg?1562924589', '0077740a-528b-4ee3-b331-fac321b95302', 3.0
),
(
    'efc9db16-53d3-4d27-ba42-c3c445f2f92f', 'Thopter Assembly', 'MOC', '386', 'rare',
    NULL, 'Artifact Creature — Thopter', '{6}', 'https://cards.scryfall.io/small/front/e/f/efc9db16-53d3-4d27-ba42-c3c445f2f92f.jpg?1682210293', '007c110d-4364-41e5-a8bc-6ac05ecbbd00', 6.0
),
(
    '364535a0-fa83-4e27-8cce-b38481b5eff1', 'Professor of Zoomancy // Professor of Zoomancy', 'ASTX', '18', 'common',
    NULL, 'Card // Card', NULL, NULL, '007e1815-b2ae-4861-b8c4-b0da8896d718', 0
),
(
    '626c46a3-72b8-4e04-adf2-c9c7aaf94f04', 'Vivisection Evangelist', 'ONE', '220', 'uncommon',
    'BW', 'Creature — Phyrexian Cleric', '{3}{W}{B}', 'https://cards.scryfall.io/small/front/6/2/626c46a3-72b8-4e04-adf2-c9c7aaf94f04.jpg?1675957217', '007f3b20-d58b-4986-8de8-9e419af88628', 5.0
),
(
    '0685afcb-06f6-4d18-b8c2-510764558dc1', 'Witch''s Mark', 'WOE', '158', 'common',
    'R', 'Sorcery', '{1}{R}', 'https://cards.scryfall.io/small/front/0/6/0685afcb-06f6-4d18-b8c2-510764558dc1.jpg?1692938637', '00807825-88e5-4b88-8527-a49f553a91be', 2.0
),
(
    '6ed84268-92f7-4790-99b2-f2982b6e0893', 'Dakmor Scorpion', 'S99', '73', 'common',
    'B', 'Creature — Scorpion', '{1}{B}', 'https://cards.scryfall.io/small/front/6/e/6ed84268-92f7-4790-99b2-f2982b6e0893.jpg?1562874546', '008290c2-499d-425b-9a6c-c4aeb47c33ff', 2.0
),
(
    '39060d1a-d5aa-4998-ae46-74a88a465d81', 'Olórin''s Searing Light // Olórin''s Searing Light', 'ALTC', '13', 'common',
    NULL, 'Card // Card', NULL, NULL, '008518e1-cc73-448d-94b7-53e40b8e8f21', 0
),
(
    '8c05568e-fa50-46e9-aec4-1ba5e814029e', 'Brawn', 'MOC', '292', 'uncommon',
    'G', 'Creature — Incarnation', '{3}{G}', 'https://cards.scryfall.io/small/front/8/c/8c05568e-fa50-46e9-aec4-1ba5e814029e.jpg?1682209444', '00876e98-d062-4a12-85e6-86a2b20cf867', 4.0
),
(
    '5e1b65a7-d385-428b-986c-a0d9283a5f75', 'Steadfast Cathar', 'EMN', '44', 'common',
    'W', 'Creature — Human Soldier', '{1}{W}', 'https://cards.scryfall.io/small/front/5/e/5e1b65a7-d385-428b-986c-a0d9283a5f75.jpg?1576383996', '00895741-f94f-4d80-8ca4-c436bf3c8d56', 2.0
),
(
    '9eac78a2-599f-4dba-aec7-982c5ae3f75a', 'Harald, King of Skemfar', 'KHM', '212', 'uncommon',
    'BG', 'Legendary Creature — Elf Warrior', '{1}{B}{G}', 'https://cards.scryfall.io/small/front/9/e/9eac78a2-599f-4dba-aec7-982c5ae3f75a.jpg?1631051439', '0089b07c-7f47-4a9a-9fb7-cc38ec9d7bcd', 3.0
),
(
    '9091d908-456f-4127-857d-b22fdb4f2fd9', 'Magma Sliver', 'LGN', '107', 'rare',
    'R', 'Creature — Sliver', '{3}{R}', 'https://cards.scryfall.io/small/front/9/0/9091d908-456f-4127-857d-b22fdb4f2fd9.jpg?1562924149', '008ac258-763c-4379-bfcd-b9cc4d7296dd', 4.0
),
(
    '99a2ed5f-62b8-4308-a656-f273f62f6ab8', 'Deem Worthy', 'AKH', '127', 'uncommon',
    'R', 'Instant', '{4}{R}', 'https://cards.scryfall.io/small/front/9/9/99a2ed5f-62b8-4308-a656-f273f62f6ab8.jpg?1543675542', '008c92bc-3022-4d34-aa04-584576ff8f8e', 5.0
),
(
    'ef44324a-32bd-47e9-8fd9-258ba668de53', 'Coalition Relic', 'DMC', '180', 'rare',
    NULL, 'Artifact', '{3}', 'https://cards.scryfall.io/small/front/e/f/ef44324a-32bd-47e9-8fd9-258ba668de53.jpg?1673305762', '008cb342-79f5-4df6-a6b7-0e9e22ed693f', 3.0
),
(
    '2684f2e5-e3f9-4277-94a1-aba6913ac53b', 'Vizier of Deferment', 'AKH', '37', 'uncommon',
    'W', 'Creature — Human Cleric', '{2}{W}', 'https://cards.scryfall.io/small/front/2/6/2684f2e5-e3f9-4277-94a1-aba6913ac53b.jpg?1543674846', '008d5896-6fc9-4aaa-8c6f-a44c2feb98bb', 3.0
),
(
    '4063be5b-bfd9-43c5-bc39-09a40bc793bf', 'Tinybones, Trinket Thief', 'JMP', '17', 'mythic',
    'B', 'Legendary Creature — Skeleton Rogue', '{1}{B}', 'https://cards.scryfall.io/small/front/4/0/4063be5b-bfd9-43c5-bc39-09a40bc793bf.jpg?1632261785', '008eda1f-b913-4f04-8c29-5e87c270149e', 2.0
),
(
    '099352e2-38c8-4fb4-a25f-6d928aa20f9e', 'Shizo, Death''s Storehouse', 'DMC', '233', 'rare',
    NULL, 'Legendary Land', NULL, 'https://cards.scryfall.io/small/front/0/9/099352e2-38c8-4fb4-a25f-6d928aa20f9e.jpg?1673306226', '008f2698-1721-45a3-8353-10f2f400dc8f', 0
),
(
    '13a4c124-216b-44b1-b49a-3db3f033e4cd', 'Summon the School', 'LRW', '42', 'uncommon',
    'W', 'Kindred Sorcery — Merfolk', '{3}{W}', 'https://cards.scryfall.io/small/front/1/3/13a4c124-216b-44b1-b49a-3db3f033e4cd.jpg?1562338889', '00909d51-3da8-41eb-a535-0c325fedc59f', 4.0
),
(
    '4123da54-9947-462e-9862-3eecc459a75b', 'Courageous Outrider', 'EMN', '18', 'uncommon',
    'W', 'Creature — Human Scout', '{3}{W}', 'https://cards.scryfall.io/small/front/4/1/4123da54-9947-462e-9862-3eecc459a75b.jpg?1576383807', '00915480-ffa8-4930-a158-b1c1f75b7876', 4.0
),
(
    'a8003786-6e2a-4e2d-a915-f23293c7273a', 'Soul-Scar Mage', 'AKH', '148', 'rare',
    'R', 'Creature — Human Wizard', '{R}', 'https://cards.scryfall.io/small/front/a/8/a8003786-6e2a-4e2d-a915-f23293c7273a.jpg?1543675694', '009240f3-b7f8-4cbe-a3e9-974da66fb62c', 1.0
),
(
    '49827a57-cf10-4a44-a1fd-ac611da39dc9', 'Airdrop Aeronauts', 'AER', '5', 'uncommon',
    'W', 'Creature — Dwarf Scout', '{3}{W}{W}', 'https://cards.scryfall.io/small/front/4/9/49827a57-cf10-4a44-a1fd-ac611da39dc9.jpg?1576381286', '009a399b-c78e-475b-8bc3-7db2afc9d676', 5.0
),
(
    '28273a5b-57b3-4b7a-b017-5886c171c9c9', 'Mindlink Mech', 'NEO', '62', 'rare',
    'U', 'Artifact — Vehicle', '{2}{U}', 'https://cards.scryfall.io/small/front/2/8/28273a5b-57b3-4b7a-b017-5886c171c9c9.jpg?1654566784', '009a4073-5946-4131-928c-c5c373745344', 3.0
),
(
    'bd17b2c1-c3dd-4f6f-a44c-dc81c6bc1c94', 'Scaled Wurm', 'CNS', '178', 'common',
    'G', 'Creature — Wurm', '{7}{G}', 'https://cards.scryfall.io/small/front/b/d/bd17b2c1-c3dd-4f6f-a44c-dc81c6bc1c94.jpg?1562866415', '009a8e38-74d0-4b4a-b8ca-62c9f3183531', 8.0
),
(
    'b338e078-629c-4cac-bd1d-e1f0a132728d', 'Refurbished Familiar', 'MH3', '105', 'common',
    'B', 'Artifact Creature — Zombie Rat', '{3}{B}', 'https://cards.scryfall.io/small/front/b/3/b338e078-629c-4cac-bd1d-e1f0a132728d.jpg?1717012055', '009e1638-9055-4872-93e1-85841bce4648', 4.0
),
(
    'ae2998a1-1713-467e-a08e-0efd8720aa5b', 'Yorvo, Lord of Garenbrig', 'ELD', '185', 'rare',
    'G', 'Legendary Creature — Giant Noble', '{G}{G}{G}', 'https://cards.scryfall.io/small/front/a/e/ae2998a1-1713-467e-a08e-0efd8720aa5b.jpg?1572490720', '00a15abc-bdac-4977-90a0-f08d41941d01', 3.0
),
(
    'ddc770fd-d513-420b-94f8-f2d28d8ed8d1', 'Labyrinth Adversary', 'ACR', '290', 'uncommon',
    'R', 'Creature — Minotaur', '{3}{R}', 'https://cards.scryfall.io/small/front/d/d/ddc770fd-d513-420b-94f8-f2d28d8ed8d1.jpg?1721425662', '00a9bdd0-8a39-4489-bd42-2ac92e550781', 4.0
),
(
    '9e81806d-5d87-4032-ad94-c2cdeabecdbf', 'Squadron Hawk', 'A25', '34', 'common',
    'W', 'Creature — Bird', '{1}{W}', 'https://cards.scryfall.io/small/front/9/e/9e81806d-5d87-4032-ad94-c2cdeabecdbf.jpg?1562439058', '00ab9841-934f-4a66-a98d-68d01661b1c9', 2.0
),
(
    '5af01330-05c2-4c5b-9830-2886711b2b5d', 'Boros Recruit', 'RAV', '243', 'common',
    'RW', 'Creature — Goblin Soldier', '{R/W}', 'https://cards.scryfall.io/small/front/5/a/5af01330-05c2-4c5b-9830-2886711b2b5d.jpg?1598917696', '00abb43b-550f-42d2-9049-61ac56ff5d8d', 1.0
),
(
    '3002ccef-5322-4f99-9fce-3b4303347240', 'Patchwork Gnomes', 'MH2', '299', 'uncommon',
    NULL, 'Artifact Creature — Gnome', '{3}', 'https://cards.scryfall.io/small/front/3/0/3002ccef-5322-4f99-9fce-3b4303347240.jpg?1632159130', '00ad27a1-9162-408d-ac75-970e45d7e06c', 3.0
),
(
    'b67e28b2-9d25-4873-8db2-1f0853ab0c47', 'Ogre Arsonist', 'P02', '110', 'uncommon',
    'R', 'Creature — Ogre', '{4}{R}', 'https://cards.scryfall.io/small/front/b/6/b67e28b2-9d25-4873-8db2-1f0853ab0c47.jpg?1562937984', '00af96af-5eae-4044-a2f7-a08cd0699d1e', 5.0
),
(
    '61d4899f-11a4-4a2c-a499-3a447b792f86', 'Hunt the Hunter', 'THS', '159', 'uncommon',
    'G', 'Sorcery', '{G}', 'https://cards.scryfall.io/small/front/6/1/61d4899f-11a4-4a2c-a499-3a447b792f86.jpg?1562818942', '00afc724-be09-4e92-a50c-88011bd10ccd', 1.0
),
(
    '07076412-18fe-4e15-bdb5-17111b4a66db', 'Timber Gorge', 'M19', '258', 'common',
    NULL, 'Land', NULL, 'https://cards.scryfall.io/small/front/0/7/07076412-18fe-4e15-bdb5-17111b4a66db.jpg?1562300278', '00b34fab-5a80-4a4d-b6cf-72479197677a', 0
),
(
    '77a43413-3ab0-4ef6-83de-192a11d48f00', 'Blur', 'CLB', '58', 'common',
    'U', 'Instant', '{2}{U}', 'https://cards.scryfall.io/small/front/7/7/77a43413-3ab0-4ef6-83de-192a11d48f00.jpg?1674135418', '00b36996-43c6-42a5-892c-c7c8864cf973', 3.0
),
(
    '0382cb94-0836-4e23-99b7-034faa363203', 'Crypt Creeper', 'AVR', '91', 'common',
    'B', 'Creature — Zombie', '{1}{B}', 'https://cards.scryfall.io/small/front/0/3/0382cb94-0836-4e23-99b7-034faa363203.jpg?1592708795', '00b3971b-5bf7-4a3f-9607-6265f9af9098', 2.0
),
(
    '41f18f42-b86b-4a12-9f0d-76b761571195', 'Spider-Ham, Peter Porker', 'SPM', '114', 'rare',
    'G', 'Legendary Creature — Spider Boar Hero', '{1}{G}', 'https://cards.scryfall.io/small/front/4/1/41f18f42-b86b-4a12-9f0d-76b761571195.jpg?1753545274', '00b50215-e832-417f-9c80-2bc3050b6ebb', 2.0
),
(
    'd82a4c78-d2fc-425a-8d0e-2e64509a08f1', 'Sauron, the Lidless Eye', 'LTR', '288', 'mythic',
    'BR', 'Legendary Creature — Avatar Horror', '{3}{B}{R}', 'https://cards.scryfall.io/small/front/d/8/d82a4c78-d2fc-425a-8d0e-2e64509a08f1.jpg?1715720382', '00b9d3a3-fd64-4757-9159-b3af06b5f5b1', 5.0
),
(
    '298f1ab2-4c66-4d91-8f6a-1bad230632df', 'Ogre Battlecaster', 'J22', '36', 'rare',
    'R', 'Creature — Ogre Shaman', '{2}{R}', 'https://cards.scryfall.io/small/front/2/9/298f1ab2-4c66-4d91-8f6a-1bad230632df.jpg?1675644735', '00ba0c24-a671-493e-ba46-13e45d1818f1', 3.0
),
(
    '0e814e48-cd9d-428f-90e2-74d97cb9c8f1', 'Fear of Falling', 'DSK', '56', 'uncommon',
    'U', 'Enchantment Creature — Nightmare', '{3}{U}{U}', 'https://cards.scryfall.io/small/front/0/e/0e814e48-cd9d-428f-90e2-74d97cb9c8f1.jpg?1726286065', '00ba96e0-42a7-432a-a500-5e607d75a358', 5.0
),
(
    '90489370-dac6-4e45-a837-d9cb6c8e66b2', 'Dairy Cow', 'MB2', '574', 'rare',
    'G', 'Creature — Cow', '{G}', 'https://cards.scryfall.io/small/front/9/0/90489370-dac6-4e45-a837-d9cb6c8e66b2.jpg?1723264297', '00bc1215-553d-40ae-b0e6-681b2d289a0a', 1.0
),
(
    'b9af422c-f4f6-4497-afcb-b914cdd1e800', 'The Bear Force Pilot', 'UNK', 'RG59', 'rare',
    'G', 'Legendary Creature — Bear Pilot', '{1}{G}', 'https://cards.scryfall.io/small/front/b/9/b9af422c-f4f6-4497-afcb-b914cdd1e800.jpg?1740485317', '00bcada7-9028-4919-8de2-ddb74c1c7ef8', 2.0
),
(
    '3620ed96-1d15-4942-b9e5-9f9a64b0cab4', 'Devoted Paladin', 'AFR', '11', 'common',
    'W', 'Creature — Orc Knight', '{4}{W}', 'https://cards.scryfall.io/small/front/3/6/3620ed96-1d15-4942-b9e5-9f9a64b0cab4.jpg?1627701579', '00bcbeb5-196a-4a54-ac8d-dec708e68d01', 5.0
),
(
    'a232d196-490d-4712-b2a2-466751b28d11', 'Unyielding Krumar', 'KTK', '94', 'common',
    'B', 'Creature — Orc Warrior', '{3}{B}', 'https://cards.scryfall.io/small/front/a/2/a232d196-490d-4712-b2a2-466751b28d11.jpg?1562791316', '00bcfbaf-cd31-4688-973e-4238749051b7', 4.0
),
(
    'bbba7b9f-d944-4987-b60d-34733382ec53', 'Hot Pursuit', 'MKC', '32', 'rare',
    'R', 'Enchantment', '{1}{R}', 'https://cards.scryfall.io/small/front/b/b/bbba7b9f-d944-4987-b60d-34733382ec53.jpg?1706240477', '00bf9859-d5bf-455a-a4be-965ea4250c7e', 2.0
),
(
    'cb1563a1-c8dc-4fcb-b9c8-e7432235d31e', 'Solemn Simulacrum', 'TDC', '325', 'rare',
    NULL, 'Artifact Creature — Golem', '{4}', 'https://cards.scryfall.io/small/front/c/b/cb1563a1-c8dc-4fcb-b9c8-e7432235d31e.jpg?1743207347', '00c0543c-2a1f-4425-8283-4062d74a1637', 4.0
),
(
    'a36e682d-b43d-4e08-bf5b-70d7e924dbe5', 'Stormchaser''s Talent', 'BLB', '75', 'rare',
    'U', 'Enchantment — Class', '{U}', 'https://cards.scryfall.io/small/front/a/3/a36e682d-b43d-4e08-bf5b-70d7e924dbe5.jpg?1739650074', '00c1788d-c52f-4839-9cd8-11fb86c418b6', 1.0
),
(
    '3d62ce9f-a680-492b-ade1-52c6813604d4', 'Furnace Oriflamme', 'UNK', 'UR13', 'uncommon',
    'R', 'Enchantment', '{2}{R}', 'https://cards.scryfall.io/small/front/3/d/3d62ce9f-a680-492b-ade1-52c6813604d4.jpg?1726911031', '00c31b71-9bd3-4ac6-9efe-c05d56d18b91', 3.0
),
(
    '09950456-09d6-4675-9995-0dc540ddb6e4', 'Demonic Vigor', 'DOM', '85', 'common',
    'B', 'Enchantment — Aura', '{B}', 'https://cards.scryfall.io/small/front/0/9/09950456-09d6-4675-9995-0dc540ddb6e4.jpg?1562731072', '00cb93a8-5d33-4c6a-9e2a-4b3560f76f3f', 1.0
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