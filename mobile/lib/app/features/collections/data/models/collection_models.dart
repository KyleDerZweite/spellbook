import 'package:json_annotation/json_annotation.dart';

part 'collection_models.g.dart';

@JsonSerializable()
class Collection {
  final String id;
  final String name;
  final String? description;
  @JsonKey(name: 'user_id')
  final String userId;
  @JsonKey(name: 'card_count')
  final int? cardCount;
  @JsonKey(name: 'total_value')
  final double? totalValue;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;
  @JsonKey(name: 'updated_at')
  final DateTime updatedAt;

  const Collection({
    required this.id,
    required this.name,
    this.description,
    required this.userId,
    this.cardCount,
    this.totalValue,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Collection.fromJson(Map<String, dynamic> json) => _$CollectionFromJson(json);
  Map<String, dynamic> toJson() => _$CollectionToJson(this);
}

@JsonSerializable()
class CollectionCard {
  final String id;
  @JsonKey(name: 'collection_id')
  final String collectionId;
  @JsonKey(name: 'card_scryfall_id')
  final String cardScryfallId;
  final int quantity;
  final String? condition;
  @JsonKey(name: 'is_foil')
  final bool isFoil;
  @JsonKey(name: 'purchase_price')
  final double? purchasePrice;
  final String? notes;
  final CardInfo? card;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;
  @JsonKey(name: 'updated_at')
  final DateTime updatedAt;

  const CollectionCard({
    required this.id,
    required this.collectionId,
    required this.cardScryfallId,
    required this.quantity,
    this.condition,
    this.isFoil = false,
    this.purchasePrice,
    this.notes,
    this.card,
    required this.createdAt,
    required this.updatedAt,
  });

  factory CollectionCard.fromJson(Map<String, dynamic> json) => _$CollectionCardFromJson(json);
  Map<String, dynamic> toJson() => _$CollectionCardToJson(this);
}

@JsonSerializable()
class CardInfo {
  @JsonKey(name: 'scryfall_id')
  final String scryfallId;
  final String name;
  @JsonKey(name: 'mana_cost')
  final String? manaCost;
  @JsonKey(name: 'type_line')
  final String? typeLine;
  @JsonKey(name: 'oracle_text')
  final String? oracleText;
  final String? rarity;
  @JsonKey(name: 'set_code')
  final String? setCode;
  @JsonKey(name: 'set_name')
  final String? setName;
  @JsonKey(name: 'image_uri')
  final String? imageUri;
  final Map<String, dynamic>? prices;

  const CardInfo({
    required this.scryfallId,
    required this.name,
    this.manaCost,
    this.typeLine,
    this.oracleText,
    this.rarity,
    this.setCode,
    this.setName,
    this.imageUri,
    this.prices,
  });

  factory CardInfo.fromJson(Map<String, dynamic> json) => _$CardInfoFromJson(json);
  Map<String, dynamic> toJson() => _$CardInfoToJson(this);

  String? get priceUsd => prices?['usd']?.toString();
  String? get priceFoil => prices?['usd_foil']?.toString();
}

@JsonSerializable()
class CollectionStats {
  @JsonKey(name: 'collection_id')
  final String collectionId;
  @JsonKey(name: 'collection_name')
  final String collectionName;
  @JsonKey(name: 'total_cards')
  final int totalCards;
  @JsonKey(name: 'unique_cards')
  final int uniqueCards;
  @JsonKey(name: 'total_value_usd')
  final double totalValueUsd;
  @JsonKey(name: 'sets_collected')
  final int setsCollected;
  @JsonKey(name: 'rarity_breakdown')
  final Map<String, int>? rarityBreakdown;
  @JsonKey(name: 'color_breakdown')
  final Map<String, int>? colorBreakdown;

  const CollectionStats({
    required this.collectionId,
    required this.collectionName,
    required this.totalCards,
    required this.uniqueCards,
    required this.totalValueUsd,
    required this.setsCollected,
    this.rarityBreakdown,
    this.colorBreakdown,
  });

  factory CollectionStats.fromJson(Map<String, dynamic> json) => _$CollectionStatsFromJson(json);
  Map<String, dynamic> toJson() => _$CollectionStatsToJson(this);
}

class CollectionDetail {
  final Collection collection;
  final List<CollectionCard> cards;
  final CollectionStats stats;

  const CollectionDetail({
    required this.collection,
    required this.cards,
    required this.stats,
  });
}
