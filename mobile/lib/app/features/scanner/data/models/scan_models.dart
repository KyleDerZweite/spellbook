import 'package:json_annotation/json_annotation.dart';

part 'scan_models.g.dart';

@JsonSerializable()
class ScanBatch {
  final String id;
  @JsonKey(name: 'user_id')
  final String userId;
  @JsonKey(name: 'collection_id')
  final String? collectionId;
  final String status;
  @JsonKey(name: 'total_scans')
  final int totalScans;
  @JsonKey(name: 'completed_scans')
  final int completedScans;
  @JsonKey(name: 'failed_scans')
  final int failedScans;
  @JsonKey(name: 'device_info')
  final Map<String, dynamic>? deviceInfo;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;
  @JsonKey(name: 'completed_at')
  final DateTime? completedAt;

  const ScanBatch({
    required this.id,
    required this.userId,
    this.collectionId,
    required this.status,
    required this.totalScans,
    required this.completedScans,
    required this.failedScans,
    this.deviceInfo,
    required this.createdAt,
    this.completedAt,
  });

  factory ScanBatch.fromJson(Map<String, dynamic> json) => _$ScanBatchFromJson(json);
  Map<String, dynamic> toJson() => _$ScanBatchToJson(this);

  double get progress {
    if (totalScans == 0) return 0;
    return completedScans / totalScans;
  }

  bool get isComplete => status == 'completed';
  bool get hasFailed => failedScans > 0;
}

@JsonSerializable()
class ScanResult {
  final String id;
  @JsonKey(name: 'batch_id')
  final String batchId;
  final String status;
  @JsonKey(name: 'image_url')
  final String? imageUrl;
  @JsonKey(name: 'thumbnail_url')
  final String? thumbnailUrl;
  @JsonKey(name: 'ocr_text')
  final String? ocrText;
  @JsonKey(name: 'ocr_confidence')
  final double? ocrConfidence;
  @JsonKey(name: 'extracted_data')
  final ExtractedCardData? extractedData;
  @JsonKey(name: 'matched_card_id')
  final String? matchedCardId;
  @JsonKey(name: 'match_candidates')
  final List<MatchCandidate>? matchCandidates;
  @JsonKey(name: 'match_confidence')
  final double? matchConfidence;
  @JsonKey(name: 'user_confirmed')
  final bool? userConfirmed;
  @JsonKey(name: 'confirmed_card_id')
  final String? confirmedCardId;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;
  @JsonKey(name: 'error_message')
  final String? errorMessage;

  const ScanResult({
    required this.id,
    required this.batchId,
    required this.status,
    this.imageUrl,
    this.thumbnailUrl,
    this.ocrText,
    this.ocrConfidence,
    this.extractedData,
    this.matchedCardId,
    this.matchCandidates,
    this.matchConfidence,
    this.userConfirmed,
    this.confirmedCardId,
    required this.createdAt,
    this.errorMessage,
  });

  factory ScanResult.fromJson(Map<String, dynamic> json) => _$ScanResultFromJson(json);
  Map<String, dynamic> toJson() => _$ScanResultToJson(this);

  ScanResult copyWith({
    String? status,
    bool? userConfirmed,
    String? confirmedCardId,
  }) {
    return ScanResult(
      id: id,
      batchId: batchId,
      status: status ?? this.status,
      imageUrl: imageUrl,
      thumbnailUrl: thumbnailUrl,
      ocrText: ocrText,
      ocrConfidence: ocrConfidence,
      extractedData: extractedData,
      matchedCardId: matchedCardId,
      matchCandidates: matchCandidates,
      matchConfidence: matchConfidence,
      userConfirmed: userConfirmed ?? this.userConfirmed,
      confirmedCardId: confirmedCardId ?? this.confirmedCardId,
      createdAt: createdAt,
      errorMessage: errorMessage,
    );
  }

  bool get needsReview => status == 'pending_review' || matchConfidence != null && matchConfidence! < 0.8;
  bool get isProcessing => status == 'processing';
  bool get isCompleted => status == 'completed';
  bool get isFailed => status == 'failed';
}

@JsonSerializable()
class ExtractedCardData {
  @JsonKey(name: 'card_name')
  final String? cardName;
  @JsonKey(name: 'type_line')
  final String? typeLine;
  @JsonKey(name: 'set_code')
  final String? setCode;
  @JsonKey(name: 'collector_number')
  final String? collectorNumber;
  @JsonKey(name: 'mana_cost')
  final String? manaCost;

  const ExtractedCardData({
    this.cardName,
    this.typeLine,
    this.setCode,
    this.collectorNumber,
    this.manaCost,
  });

  factory ExtractedCardData.fromJson(Map<String, dynamic> json) => _$ExtractedCardDataFromJson(json);
  Map<String, dynamic> toJson() => _$ExtractedCardDataToJson(this);
}

@JsonSerializable()
class MatchCandidate {
  @JsonKey(name: 'scryfall_id')
  final String scryfallId;
  final String name;
  @JsonKey(name: 'set_name')
  final String setName;
  @JsonKey(name: 'set_code')
  final String setCode;
  @JsonKey(name: 'collector_number')
  final String? collectorNumber;
  @JsonKey(name: 'image_url')
  final String? imageUrl;
  final double confidence;
  final Map<String, dynamic>? prices;

  const MatchCandidate({
    required this.scryfallId,
    required this.name,
    required this.setName,
    required this.setCode,
    this.collectorNumber,
    this.imageUrl,
    required this.confidence,
    this.prices,
  });

  factory MatchCandidate.fromJson(Map<String, dynamic> json) => _$MatchCandidateFromJson(json);
  Map<String, dynamic> toJson() => _$MatchCandidateToJson(this);

  String? get priceUsd => prices?['usd']?.toString();
}
