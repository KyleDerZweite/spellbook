# Market prices for the dashboard and trading

- Status: Research, implementation proposal
- Last Reviewed: 2026-10-06
- Source of Truth: linked provider documentation, public data responses, and repository code
- Update Triggers: provider access or terms, price fields and freshness, printing identity, inventory cost basis, accepted pricing or trading scope
- Related Docs: [Integrations](./README.md), [Domain glossary](../../GLOSSARY.md), [Product specification](../product/specification.md#dashboard), [Catalog](../architecture/catalog.md), [Worker](../architecture/worker.md), [Postgres](../architecture/postgres.md)

A daily shared price import from Scryfall is enough for an initial dashboard estimate. The existing bulk data already includes prices. Cardmarket offers public downloads for a specifically named Cardmarket trend price. Direct marketplace APIs are not a reliable basis for a new integration at present because both providers restrict new access. This recommendation is a proposal. Prices and trading are not implemented.

## Current state in Spellbook

The [Worker](../architecture/worker.md) downloads `all_cards` by default and syncs daily. [transform_card](../../worker/src/worker/transform.py) does not carry over `prices`, marketplace IDs, or `purchase_uris`. [CardDocument](../../frontend/src/lib/search/types.ts) also lacks these fields. The information is therefore available in the source, but not in the published application catalog.

The [Inventory schema](../../frontend/src/lib/server/db/schema.ts) stores printing, quantity, finish, and condition. It does not store acquisition costs or purchases. The [dashboard calculation](../../frontend/src/lib/mtg/dashboard.ts) counts current inventory and deck availability. The [product specification](../product/specification.md#dashboard) currently excludes prices and historical value trends. A later implementation needs an accepted product contract.

## Available sources

| Source                                       | Access on 2026-10-06                                        | Suitable use                                                   | Limitation                                                                           |
| -------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Scryfall Card Objects and Bulk Data          | Public, successfully read without an account or API key     | Daily estimate per available printing and finish               | Gaps, no condition prices, no live offers                                            |
| Cardmarket Price Guide and Product Catalogue | Public JSON files successfully read                         | EUR reference values with an explicitly selected price measure | Mapping through `idProduct`, no language or condition breakdown in the checked guide |
| Cardmarket Account API                       | No new applications according to the current help page      | At most a later approved account integration                   | No access guaranteed for Spellbook                                                   |
| TCGplayer Developer API                      | No new access according to the current getting started page | At most a later approved USD or SKU integration                | No access guaranteed for Spellbook                                                   |

### Scryfall

The [Card Object documentation](https://scryfall.com/docs/api/cards) describes daily price fields as strings. For the current inventory, `eur` and `eur_foil` are the corresponding EUR fields, and `usd` and `usd_foil` are the corresponding USD fields. The documentation also lists `usd_etched`, `eur_etched`, and `tix`. The checked responses did not contain `eur_etched`. An adapter must preserve missing fields and `null`. `tix` is for Magic Online and must not be included in a physical EUR inventory.

Scryfall syncs affiliate prices about every 24 hours. According to the [price FAQ](https://scryfall.com/docs/faqs/where-do-scryfall-prices-come-from-7), it uses the TCGplayer Market Price. For Cardmarket, it uses available trend, daily average, seven day average, average, or suggested prices. A single `eur` field does not name the measure used. The display should therefore say "Cardmarket reference via Scryfall." It must not claim that the field is always the same trend price.

The [Bulk documentation](https://scryfall.com/docs/api/bulk-data) confirms price fields in Card Objects. It describes prices as stale after 24 hours and limits their suitability to general estimates and trends. Bulk prices are not a basis for a storefront or sales process. `all_cards` contains all available languages. `default_cards` contains mostly English records. Switching to `default_cards` would therefore not cover the exact German printings in the inventory.

The current [rate limits](https://scryfall.com/docs/api/rate-limits) are two requests per second for `/cards/search`, `/cards/named`, `/cards/random`, and `/cards/collection`. `/cards/manifest` allows ten per minute, and other methods allow ten per second. Scryfall requires bulk files for fast or large price queries and recommends at least a 24 hour cache. On HTTP 429, the client must reduce requests. The [API rules](https://scryfall.com/docs/api) require suitable `User-Agent` and `Accept` headers.

Scryfall provides the data [free of charge under usage rules](https://scryfall.com/docs/api#use-of-scryfall-data-and-images). These include providing additional value to users, not claiming Scryfall's endorsement, and not putting Scryfall data behind a paywall. The [Terms](https://scryfall.com/docs/terms) describe prices as informational and nonbinding. These conditions are not a general license for marketplace transactions.

### Cardmarket

In 2024, Cardmarket made the Price Guide and Product Catalogue [publicly available](https://news.cardmarket.com/en/Magic/were-making-the-price-guide-and-product-catalogue-available-for-download). The guide updates daily, and the product catalog updates with new releases. The previous API endpoints were deprecated for this purpose. The [official explanation](https://insight.cardmarket.com/en/Articles/the-state-of-cardmarket-2024) confirms that the downloads require no API access. The [download page](https://www.cardmarket.com/en/Magic/Data/Price-Guide) returned HTTP 403 during this research, but the files themselves were accessible without credentials.

The checked [Magic Price Guide](https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json) contains `createdAt`, `idProduct`, and values such as `low`, `trend`, `avg1`, `avg7`, `avg30`, and their `-foil` variants. The [previous official field description](https://apiv2.cardmarket.com/ws/documentation/API_2.0:PriceGuide) distinguishes lowest offers, trend prices, and average sales. These measures must not be silently substituted for one another. The current JSON guide has no `language` or `condition` dimension. It does not establish an exact price for a German LP copy.

The [Product Catalogue](https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_1.json) provides product IDs and names. For existing mappings, Scryfall's nullable `cardmarket_id` is the appropriate link to `idProduct`. The [Scryfall field definition](https://scryfall.com/docs/api/cards) confirms this relationship. Matching by card name or `oracle_id` alone is insufficient because sets and treatments differ. A missing mapping remains unknown.

Cardmarket's [current API help](https://help.cardmarket.com/en/cardmarket-api) accepts no new applications. Existing dedicated app credentials must not be shared with third party apps. The older [authentication documentation](https://apiv2.cardmarket.com/ws/documentation/API:Auth_Overview) describes manual approval and specific app types. This documentation does not establish access that is available today. Public reference data requires no account connection. A reliable price for a future approved API contract was not established.

### TCGplayer

The [Getting Started page](https://docs.tcgplayer.com/docs/getting-started) requires a Developer Key and says that no new API access is currently being granted. Existing [product prices](https://docs.tcgplayer.com/reference/pricing_getproductprices-1) distinguish `marketPrice`, `lowPrice`, and other measures by product subtype. [SKU details](https://docs.tcgplayer.com/reference/catalog_getskus) include Language, Condition, and Printing IDs. [SKU prices](https://docs.tcgplayer.com/reference/pricing_getproductconditionprices-1) allow finer references accordingly, where access is approved.

The [Market Price](https://help.tcgplayer.com/hc/en-us/articles/213588017-TCGplayer-Market-Price) is based on recent completed sales. It is not a personal purchase price. The [API terms](https://help.tcgplayer.com/hc/en-us/articles/360061115874-TCGplayer-API-Terms-Conditions) restrict use to approved purposes and require attribution with a product link when showing prices. A new direct integration or its price was not verified. It is not required for the initial EUR estimate.

## Proposal for a later implementation

The smallest useful contract is a shared price reference per exact printing, finish, provider, price measure, and currency. It includes an optional amount, the original provider identity and field provenance, the source snapshot time, and the import time. Amounts need a decimal or integer money representation. Missing values remain unknown. An import time must not appear to be the time of an individual market sale.

The Worker can import the existing Scryfall prices once daily for all accounts. The first implementation needs no generic plugin framework and no user queries to marketplaces. A shared server side lookup function keeps provider details out of the dashboard calculation. A later Cardmarket adapter could meet the same contract with an explicitly chosen `trend` or `avg7`. Catalog identity remains with the Catalog, ownership remains with Inventory, and valuation remains with the account specific summary. Publication and error behavior must follow the existing [Catalog contract](../architecture/catalog.md#storage-and-publication).

The first lookup rules should use only exact printing and finish. `null`, missing provider IDs, unresolved treatments, and stale sources do not count as zero. The current inventory distinguishes only `nonfoil` and `foil`, while the transformation combines `etched` as an available foil variant. A general switch to Etched prices would therefore lack a domain basis. Language substitutions or blanket condition discounts would be additional product decisions. Any later fallback must visibly state its different language or valuation method.

A useful first dashboard shows the estimated value of valued copies in EUR, their quantity based share of the entire inventory, and the number of unvalued copies. It shows the source, the price measure where known, and the data timestamp. The total is `quantity × referencePrice` for valid references. Example: if 80 of 100 copies can be valued, coverage is 80%. The sum for those 80 copies is not a fully determined total value. Condition differences remain a visible valuation limit. Without its own shipping and fee calculation, the value is also not net sale proceeds.

Acquisition costs require user supplied data or an explicitly authorized transaction import. The current grouped inventory does not record purchases at different unit prices. A cost basis model would need to define cost allocation, purchase date, quantity, currency, and fee handling. Profit and loss also require actual sales data. Historical value trends require stored price snapshots and inventory history. `updatedAt`, today's inventory, and Cardmarket's `avg7` or `avg30` do not replace that history.

For a first trading step, external product links from Scryfall's documented `purchase_uris` are enough. These may lead to search results and do not provide availability or prices for a particular condition. Account linking, listing offers, stock sync, cart, and order import would be separate integrations requiring approved access. None of these follows from a Price Guide.

## Observations and outstanding evidence

On 2026-10-06, the [Bulk index](https://api.scryfall.com/bulk-data), the first record from its current `all_cards` download, and the two Cardmarket JSON files were read without credentials. The bulk record contained `prices`, `cardmarket_id`, and `tcgplayer_id`. The Cardmarket guide had `createdAt: 2026-10-06T02:48:11+0200`. A full coverage measurement was not performed.

The [English Sol Ring printing CMM 410](https://api.scryfall.com/cards/cmm/410/en) had EUR and foil prices, as well as a Cardmarket ID. The [German printing from the same set and collector number](https://api.scryfall.com/cards/cmm/410/de) had `null` for those fields. This shows a real coverage gap, but not a general rate for German cards. The values are only a dated format sample.

Before implementation, the accepted price measure, stale rule, and desired language coverage must be set. A limited data check should cover German printings, foil, Etched, alternate treatments, and missing references. Acceptance evidence also needs a failed refresh that preserves the old reference, visibly stale data, and a traceable quantity based dashboard total. No marketplace accounts were connected, and no real listings or transactions were checked.
