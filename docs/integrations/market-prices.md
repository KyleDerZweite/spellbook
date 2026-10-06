# Marktpreise für Dashboard und Trading

- Status: Research, implementation proposal
- Last Reviewed: 2026-10-06
- Source of Truth: linked provider documentation, public data responses and repository code
- Update Triggers: provider access or terms, price fields and freshness, printing identity, inventory cost basis, accepted pricing or trading scope
- Related Docs: [Integrations](./README.md), [Domain glossary](../../GLOSSARY.md), [Product specification](../product/specification.md#dashboard), [Catalog](../architecture/catalog.md), [Worker](../architecture/worker.md), [Postgres](../architecture/postgres.md)

Für eine erste Dashboard-Bewertung reicht ein täglicher gemeinsamer Preisimport aus Scryfall. Die bestehenden Bulk-Daten enthalten bereits Preise. Für einen ausdrücklich benannten Cardmarket-Trendpreis bietet Cardmarket öffentliche Downloads. Direkte Marketplace-APIs sind derzeit keine verlässliche Grundlage für eine neue Integration, weil beide Anbieter neue Zugänge einschränken. Diese Empfehlung ist ein Vorschlag. Preise und Trading sind nicht implementiert.

## Aktueller Stand in Spellbook

Der [Worker](../architecture/worker.md) lädt standardmäßig `all_cards` und synchronisiert täglich. [transform_card](../../worker/src/worker/transform.py) übernimmt weder `prices` noch Marketplace-IDs oder `purchase_uris`. Auch [CardDocument](../../frontend/src/lib/search/types.ts) enthält diese Felder nicht. Die Informationen sind damit in der Quelle verfügbar, aber nicht im veröffentlichten Anwendungskatalog.

Das [Inventory-Schema](../../frontend/src/lib/server/db/schema.ts) speichert Printing, Quantity, Finish und Condition. Es speichert keine Anschaffungskosten oder Käufe. Die [Dashboard-Berechnung](../../frontend/src/lib/mtg/dashboard.ts) zählt aktuelle Bestände und Deck-Verfügbarkeit. Die [Produktspezifikation](../product/specification.md#dashboard) schließt Preise und historische Wertentwicklung bislang aus. Eine spätere Umsetzung braucht einen akzeptierten Produktvertrag.

## Verfügbare Quellen

| Quelle                                       | Zugang am 2026-10-06                                      | Geeigneter Zweck                                        | Grenze                                                                                    |
| -------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Scryfall Card Objects und Bulk Data          | Öffentlich, ohne Account oder API-Key erfolgreich gelesen | Tägliche Schätzung pro verfügbarer Printing und Finish  | Lücken, keine Condition-Preise, keine Live-Angebote                                       |
| Cardmarket Price Guide und Product Catalogue | Öffentliche JSON-Dateien erfolgreich gelesen              | EUR-Referenzwerte mit ausdrücklich gewähltem Preismaß   | Mapping über `idProduct`, keine Sprach- oder Condition-Aufschlüsselung im geprüften Guide |
| Cardmarket Account-API                       | Keine neuen Anträge laut aktueller Hilfeseite             | Allenfalls spätere genehmigte Account-Integration       | Kein zugesicherter Zugang für Spellbook                                                   |
| TCGplayer Developer API                      | Keine neuen Zugänge laut aktueller Einstiegsseite         | Allenfalls spätere genehmigte USD- oder SKU-Integration | Kein zugesicherter Zugang für Spellbook                                                   |

### Scryfall

Die [Card-Object-Dokumentation](https://scryfall.com/docs/api/cards) beschreibt tägliche Preisfelder als Strings. Für das aktuelle Inventory sind `eur` und `eur_foil` die passenden EUR-Felder, `usd` und `usd_foil` die entsprechenden USD-Felder. Die Dokumentation nennt außerdem `usd_etched`, `eur_etched` und `tix`. Die geprüften Antworten enthielten kein `eur_etched`. Ein Adapter muss fehlende Felder und `null` erhalten. `tix` gehört zu Magic Online und darf nicht in einen physischen EUR-Bestand eingehen.

Scryfall synchronisiert Affiliate-Preise etwa alle 24 Stunden. Laut [Preis-FAQ](https://scryfall.com/docs/faqs/where-do-scryfall-prices-come-from-7) übernimmt es den TCGplayer Market Price. Bei Cardmarket verwendet es verfügbare Trend-, Tagesdurchschnitts-, Siebentagesdurchschnitts-, Durchschnitts- oder Suggested-Preise. Ein einzelnes `eur`-Feld benennt das verwendete Maß nicht. Die Anzeige sollte deshalb "Cardmarket-Referenz über Scryfall" heißen. Sie darf keinen durchgehend identischen Trendpreis behaupten.

Die [Bulk-Dokumentation](https://scryfall.com/docs/api/bulk-data) bestätigt Preisfelder in den Card Objects. Sie beschreibt Preise nach 24 Stunden als veraltet und beschränkt ihre Eignung auf allgemeine Schätzungen und Trends. Bulk-Preise sind keine Grundlage für einen Storefront- oder Verkaufsprozess. `all_cards` enthält alle verfügbaren Sprachen. `default_cards` enthält überwiegend englische Records. Ein Wechsel zu `default_cards` würde daher nicht die exakten deutschen Printings des Inventory abdecken.

Die aktuellen [Rate Limits](https://scryfall.com/docs/api/rate-limits) betragen für `/cards/search`, `/cards/named`, `/cards/random` und `/cards/collection` zwei Requests pro Sekunde. `/cards/manifest` erlaubt zehn pro Minute, übrige Methoden zehn pro Sekunde. Scryfall verlangt Bulk-Dateien für schnelle oder umfangreiche Preisabfragen und empfiehlt mindestens 24 Stunden Cache. Bei HTTP 429 muss der Client Requests reduzieren. Die [API-Regeln](https://scryfall.com/docs/api) verlangen passende `User-Agent`- und `Accept`-Header.

Scryfall stellt die Daten [kostenlos unter Nutzungsregeln](https://scryfall.com/docs/api#use-of-scryfall-data-and-images) bereit. Dazu gehören zusätzlicher Nutzen für Anwender, keine behauptete Unterstützung durch Scryfall und kein Paywall-Zugang zu den Scryfall-Daten. Die [Terms](https://scryfall.com/docs/terms) beschreiben Preisangaben als unverbindliche Information. Diese Bedingungen sind keine pauschale Lizenz für Marketplace-Transaktionen.

### Cardmarket

Cardmarket hat den Price Guide und Product Catalogue [2024 öffentlich verfügbar gemacht](https://news.cardmarket.com/en/Magic/were-making-the-price-guide-and-product-catalogue-available-for-download). Der Guide aktualisiert täglich, der Produktkatalog bei neuen Releases. Die vorherigen API-Endpunkte wurden dafür abgekündigt. Die [offizielle Erklärung](https://insight.cardmarket.com/en/Articles/the-state-of-cardmarket-2024) bestätigt Downloads ohne API-Zugang. Die [Download-Seite](https://www.cardmarket.com/en/Magic/Data/Price-Guide) lieferte bei dieser Recherche HTTP 403, die Dateien selbst waren ohne Credentials erreichbar.

Der geprüfte [Magic Price Guide](https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json) enthält `createdAt`, `idProduct` und Werte wie `low`, `trend`, `avg1`, `avg7`, `avg30` sowie ihre `-foil`-Varianten. Die [bisherige offizielle Feldbeschreibung](https://apiv2.cardmarket.com/ws/documentation/API_2.0:PriceGuide) unterscheidet niedrigste Angebote, Trendpreise und durchschnittliche Verkäufe. Diese Größen dürfen nicht stillschweigend gegeneinander ausgetauscht werden. Der aktuelle JSON-Guide enthält keine `language`- oder `condition`-Dimension. Er belegt keinen exakten Preis für eine deutsche LP-Kopie.

Der [Product Catalogue](https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_1.json) liefert produktbezogene IDs und Namen. Für vorhandene Zuordnungen ist Scryfalls nullable `cardmarket_id` der passende Übergang zu `idProduct`. Die [Scryfall-Felddefinition](https://scryfall.com/docs/api/cards) bestätigt diese Beziehung. Eine Übereinstimmung über Kartenname oder `oracle_id` allein reicht wegen unterschiedlicher Sets und Treatments nicht. Fehlendes Mapping bleibt unbekannt.

Cardmarkets [aktuelle API-Hilfe](https://help.cardmarket.com/en/cardmarket-api) nimmt keine neuen Anträge an. Bestehende Dedicated-App-Credentials dürfen nicht an fremde Apps weitergegeben werden. Die ältere [Authentifizierungsdokumentation](https://apiv2.cardmarket.com/ws/documentation/API:Auth_Overview) beschreibt manuelle Genehmigung und spezielle App-Typen. Diese Dokumentation begründet keinen heute verfügbaren Zugang. Öffentliche Referenzdaten erfordern keine Account-Verknüpfung. Ein belastbarer Preis für einen künftigen genehmigten API-Vertrag wurde nicht festgestellt.

### TCGplayer

Die [Getting-Started-Seite](https://docs.tcgplayer.com/docs/getting-started) verlangt einen Developer Key und erklärt, dass derzeit keine neuen API-Zugänge vergeben werden. Vorhandene [Product-Preise](https://docs.tcgplayer.com/reference/pricing_getproductprices-1) unterscheiden `marketPrice`, `lowPrice` und weitere Maße nach Produktsubtyp. [SKU-Details](https://docs.tcgplayer.com/reference/catalog_getskus) enthalten Language-, Condition- und Printing-IDs. [SKU-Preise](https://docs.tcgplayer.com/reference/pricing_getproductconditionprices-1) erlauben entsprechend feinere Referenzen, soweit der Zugang genehmigt ist.

Der [Market Price](https://help.tcgplayer.com/hc/en-us/articles/213588017-TCGplayer-Market-Price) basiert auf jüngeren abgeschlossenen Verkäufen. Er ist kein persönlicher Kaufpreis. Die [API-Bedingungen](https://help.tcgplayer.com/hc/en-us/articles/360061115874-TCGplayer-API-Terms-Conditions) beschränken die Verwendung auf genehmigte Zwecke und verlangen Attribution samt Produktlink bei Preisangaben. Eine neue direkte Integration oder deren Preis wurde nicht verifiziert. Für die erste EUR-Auswertung ist sie nicht erforderlich.

## Vorschlag für eine spätere Umsetzung

Der kleinste sinnvolle Vertrag ist eine gemeinsame Preisreferenz pro exakter Printing, Finish, Provider, Preismaß und Währung. Er enthält einen optionalen Betrag, die originale Provider-Identität und Feldherkunft, den Quell-Snapshot-Zeitpunkt und den Importzeitpunkt. Beträge brauchen eine dezimale oder ganzzahlige Geldrepräsentation. Fehlende Werte bleiben unbekannt. Ein Importzeitpunkt darf nicht als Zeitpunkt eines einzelnen Marktabschlusses erscheinen.

Der Worker kann die vorhandenen Scryfall-Preise einmal täglich für alle Accounts übernehmen. Die erste Umsetzung benötigt keinen generischen Plugin-Rahmen und keine Benutzerabfragen an Marketplaces. Eine gemeinsame serverseitige Lookup-Funktion hält Provider-Details aus der Dashboard-Berechnung heraus. Ein späterer Cardmarket-Adapter könnte denselben Vertrag mit einem ausdrücklich gewählten `trend` oder `avg7` erfüllen. Katalogidentität bleibt beim Catalog, Ownership beim Inventory und die Bewertung bei der accountbezogenen Zusammenfassung. Publikation und Fehlerverhalten müssen dem bestehenden [Catalog-Vertrag](../architecture/catalog.md#storage-and-publication) entsprechen.

Die ersten Lookup-Regeln sollten ausschließlich exakte Printing und Finish verwenden. `null`, fehlende Provider-IDs, ungeklärte Treatments und veraltete Quellen zählen nicht als Nullwert. Das derzeitige Inventory unterscheidet nur `nonfoil` und `foil`, während die Transformation auch `etched` als verfügbare Foil-Variante zusammenfasst. Ein genereller Wechsel auf Etched-Preise wäre damit fachlich nicht begründet. Sprachübernahmen oder pauschale Abschläge für Condition wären zusätzliche Produktentscheidungen. Ein späterer Fallback müsste seine abweichende Sprache oder Bewertungsmethode sichtbar ausweisen.

Ein brauchbares erstes Dashboard zeigt den geschätzten Wert der bewertbaren Kopien in EUR, ihren mengenbezogenen Anteil am gesamten Inventory und die Zahl unbewerteter Kopien. Es zeigt Quelle, Preismaß soweit bekannt und Datenstand. Die Summe lautet `quantity × referencePrice` für gültige Referenzen. Beispiel: Bei 80 von 100 bewertbaren Kopien ist die Coverage 80 %. Die Summe dieser 80 Kopien ist kein vollständig ermittelter Gesamtwert. Condition-Abweichungen bleiben als Bewertungsgrenze sichtbar. Ohne eigene Versand- und Gebührenberechnung ist der Wert auch kein Nettoverkaufserlös.

Anschaffungskosten benötigen Nutzerangaben oder einen ausdrücklich autorisierten Transaktionsimport. Der aktuelle gruppierte Bestand dokumentiert keine Käufe zu unterschiedlichen Stückpreisen. Ein Cost-Basis-Modell müsste Kostenzuordnung, Kaufdatum, Quantity, Währung und Behandlung von Gebühren festlegen. Gewinn und Verlust brauchen zusätzlich tatsächliche Verkaufsdaten. Historische Wertentwicklung braucht gespeicherte Preis-Snapshots und Bestandshistorie. `updatedAt`, der heutige Bestand und Cardmarkets `avg7` oder `avg30` ersetzen diese Historie nicht.

Für einen ersten Trading-Schritt genügen externe Produktlinks aus Scryfalls dokumentiertem `purchase_uris`. Diese können auch auf Suchergebnisse führen und geben keine Verfügbarkeit oder Preise zu einer bestimmten Condition vor. Account-Verknüpfung, Angebote einstellen, Stock-Synchronisierung, Warenkorb und Order-Import wären getrennte Integrationen mit genehmigtem Zugriff. Keine davon ergibt sich aus einem Price Guide.

## Beobachtungen und offene Nachweise

Am 2026-10-06 wurden der [Bulk-Index](https://api.scryfall.com/bulk-data), der erste Record aus dessen aktuellem `all_cards`-Download und die beiden Cardmarket-JSON-Dateien ohne Credentials gelesen. Der Bulk-Record enthielt `prices`, `cardmarket_id` und `tcgplayer_id`. Der Cardmarket Guide hatte `createdAt: 2026-10-06T02:48:11+0200`. Eine volle Coverage-Messung wurde nicht durchgeführt.

Die [englische Sol Ring Printing CMM 410](https://api.scryfall.com/cards/cmm/410/en) hatte EUR- und Foil-Preise sowie eine Cardmarket-ID. Die [deutsche Printing desselben Sets und Collector Number](https://api.scryfall.com/cards/cmm/410/de) hatte dafür `null`. Das belegt eine reale Coverage-Lücke, aber keine allgemeine Quote für deutsche Karten. Die Werte dienen nur als datierte Formatprobe.

Vor Umsetzung sind akzeptiertes Preismaß, Stale-Regel und gewünschte Sprachabdeckung festzulegen. Ein begrenzter Datencheck sollte deutsche Printings, Foil, Etched, alternative Treatments und fehlende Referenzen abdecken. Akzeptanznachweise brauchen außerdem einen fehlgeschlagenen Refresh mit erhaltener alter Referenz, sichtbare veraltete Daten und eine nachvollziehbare mengenbezogene Dashboard-Summe. Es wurden keine Marketplace-Accounts verbunden und keine echten Listings oder Transaktionen geprüft.
