import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../network/api_constants.dart';
import '../../../network/dio_client.dart';
import '../data/models/collection_models.dart';

// Collections list provider
final collectionsProvider = AsyncNotifierProvider<CollectionsNotifier, List<Collection>>(() {
  return CollectionsNotifier();
});

class CollectionsNotifier extends AsyncNotifier<List<Collection>> {
  Dio get _dio => ref.read(dioProvider);

  @override
  Future<List<Collection>> build() async {
    return _fetchCollections();
  }

  Future<List<Collection>> _fetchCollections() async {
    final response = await _dio.get(ApiConstants.collections);
    final List<dynamic> data = response.data;
    return data.map((json) => Collection.fromJson(json)).toList();
  }

  Future<void> createCollection(String name, String? description) async {
    await _dio.post(
      ApiConstants.collections,
      data: {
        'name': name,
        if (description != null) 'description': description,
      },
    );
    ref.invalidateSelf();
  }

  Future<void> deleteCollection(String id) async {
    await _dio.delete(ApiConstants.collection(id));
    ref.invalidateSelf();
  }

  Future<void> updateCollection(String id, {String? name, String? description}) async {
    await _dio.put(
      ApiConstants.collection(id),
      data: {
        if (name != null) 'name': name,
        if (description != null) 'description': description,
      },
    );
    ref.invalidateSelf();
  }
}

// Single collection detail provider
final collectionDetailProvider = FutureProvider.family<CollectionDetail, String>((ref, id) async {
  final dio = ref.read(dioProvider);
  
  // Fetch collection info
  final collectionResponse = await dio.get(ApiConstants.collection(id));
  final collection = Collection.fromJson(collectionResponse.data);
  
  // Fetch cards
  final cardsResponse = await dio.get(ApiConstants.collectionCards(id));
  final List<dynamic> cardsData = cardsResponse.data;
  final cards = cardsData.map((json) => CollectionCard.fromJson(json)).toList();
  
  // Fetch stats
  final statsResponse = await dio.get(ApiConstants.collectionStats(id));
  final stats = CollectionStats.fromJson(statsResponse.data);
  
  return CollectionDetail(
    collection: collection,
    cards: cards,
    stats: stats,
  );
});
