import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../../../../theme/app_theme.dart';
import '../../providers/collections_provider.dart';
import '../../data/models/collection_models.dart';

class CollectionDetailPage extends ConsumerWidget {
  final String collectionId;

  const CollectionDetailPage({super.key, required this.collectionId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(collectionDetailProvider(collectionId));

    return detailAsync.when(
      loading: () => Scaffold(
        appBar: AppBar(),
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (error, stack) => Scaffold(
        appBar: AppBar(),
        body: Center(child: Text('Error: $error')),
      ),
      data: (detail) => _CollectionDetailContent(detail: detail),
    );
  }
}

class _CollectionDetailContent extends StatelessWidget {
  final CollectionDetail detail;

  const _CollectionDetailContent({required this.detail});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(detail.collection.name),
        actions: [
          PopupMenuButton(
            itemBuilder: (context) => [
              const PopupMenuItem(value: 'edit', child: Text('Edit')),
              const PopupMenuItem(value: 'export', child: Text('Export')),
              const PopupMenuItem(value: 'import', child: Text('Import')),
              const PopupMenuItem(
                value: 'delete',
                child: Text('Delete', style: TextStyle(color: Colors.red)),
              ),
            ],
            onSelected: (value) {
              // Handle menu actions
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Stats header
          Container(
            padding: const EdgeInsets.all(16),
            color: Theme.of(context).cardColor,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _StatColumn(
                  label: 'Cards',
                  value: '${detail.stats.totalCards}',
                ),
                _StatColumn(
                  label: 'Unique',
                  value: '${detail.stats.uniqueCards}',
                ),
                _StatColumn(
                  label: 'Value',
                  value: '\$${detail.stats.totalValueUsd.toStringAsFixed(2)}',
                ),
                _StatColumn(
                  label: 'Sets',
                  value: '${detail.stats.setsCollected}',
                ),
              ],
            ),
          ),

          // Cards list
          Expanded(
            child: detail.cards.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.inbox_outlined, size: 64, color: Colors.grey[400]),
                        const SizedBox(height: 16),
                        const Text('No cards yet'),
                        const SizedBox(height: 8),
                        Text(
                          'Scan or search cards to add them',
                          style: TextStyle(color: Colors.grey[600]),
                        ),
                      ],
                    ),
                  )
                : GridView.builder(
                    padding: const EdgeInsets.all(8),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 3,
                      childAspectRatio: 0.714,
                      crossAxisSpacing: 8,
                      mainAxisSpacing: 8,
                    ),
                    itemCount: detail.cards.length,
                    itemBuilder: (context, index) {
                      return _CardGridItem(card: detail.cards[index]);
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _StatColumn extends StatelessWidget {
  final String label;
  final String value;

  const _StatColumn({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey[600],
          ),
        ),
      ],
    );
  }
}

class _CardGridItem extends StatelessWidget {
  final CollectionCard card;

  const _CardGridItem({required this.card});

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: card.card?.imageUri != null
              ? CachedNetworkImage(
                  imageUrl: card.card!.imageUri!,
                  fit: BoxFit.cover,
                  width: double.infinity,
                  height: double.infinity,
                  placeholder: (context, url) => Container(
                    color: Colors.grey[300],
                    child: const Center(
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                  errorWidget: (context, url, error) => Container(
                    color: Colors.grey[300],
                    child: const Icon(Icons.broken_image),
                  ),
                )
              : Container(
                  color: Colors.grey[300],
                  child: Center(
                    child: Text(
                      card.card?.name ?? 'Unknown',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 10),
                    ),
                  ),
                ),
        ),
        
        // Quantity badge
        if (card.quantity > 1)
          Positioned(
            top: 4,
            right: 4,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: AppTheme.accentColor,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                'x${card.quantity}',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
        
        // Foil indicator
        if (card.isFoil)
          Positioned(
            bottom: 4,
            left: 4,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Colors.purple, Colors.blue, Colors.green],
                ),
                borderRadius: BorderRadius.circular(4),
              ),
              child: const Text(
                'FOIL',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 8,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
