import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../theme/app_theme.dart';
import '../../providers/scanner_provider.dart';

class ScanResultsPage extends ConsumerWidget {
  const ScanResultsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scanState = ref.watch(scannerProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan Results'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () {
            ref.read(scannerProvider.notifier).clearState();
            context.go('/scan');
          },
        ),
        actions: [
          if (scanState.scanResults.isNotEmpty)
            TextButton(
              onPressed: () {
                if (scanState.currentBatchId != null) {
                  ref.read(scannerProvider.notifier).confirmAllScans(scanState.currentBatchId!);
                  context.go('/collections');
                }
              },
              child: const Text('Confirm All'),
            ),
        ],
      ),
      body: _buildBody(context, ref, scanState),
    );
  }

  Widget _buildBody(BuildContext context, WidgetRef ref, ScannerState scanState) {
    if (scanState.isUploading) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(
              value: scanState.uploadProgress,
            ),
            const SizedBox(height: 24),
            Text(
              'Uploading... ${(scanState.uploadProgress * 100).toInt()}%',
              style: const TextStyle(fontSize: 18),
            ),
            const SizedBox(height: 8),
            Text(
              '${(scanState.uploadProgress * scanState.capturedImages.length).round()}/${scanState.capturedImages.length} cards',
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }

    if (scanState.scanResults.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.check_circle_outline, size: 64, color: Colors.green),
            const SizedBox(height: 16),
            const Text(
              'All cards processed!',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'Your cards have been added to your collection',
              style: TextStyle(color: Colors.grey[600]),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => context.go('/collections'),
              child: const Text('View Collection'),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: scanState.scanResults.length,
      itemBuilder: (context, index) {
        final scan = scanState.scanResults[index];
        return _ScanResultCard(
          scan: scan,
          onConfirm: () {
            if (scan.matchedCardId != null) {
              ref.read(scannerProvider.notifier).confirmScan(
                scan.id,
                scan.matchedCardId!,
              );
            }
          },
          onReject: () {
            ref.read(scannerProvider.notifier).rejectScan(scan.id);
          },
          onViewDetails: () {
            context.push('/scan/review/${scan.batchId}');
          },
        );
      },
    );
  }
}

class _ScanResultCard extends StatelessWidget {
  final dynamic scan;
  final VoidCallback onConfirm;
  final VoidCallback onReject;
  final VoidCallback onViewDetails;

  const _ScanResultCard({
    required this.scan,
    required this.onConfirm,
    required this.onReject,
    required this.onViewDetails,
  });

  @override
  Widget build(BuildContext context) {
    final isProcessing = scan.status == 'processing';
    final hasCandidates = scan.matchCandidates?.isNotEmpty ?? false;
    final topCandidate = hasCandidates ? scan.matchCandidates!.first : null;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onViewDetails,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Thumbnail
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: SizedBox(
                  width: 70,
                  height: 98,
                  child: scan.thumbnailUrl != null
                      ? Image.network(
                          scan.thumbnailUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
                            color: Colors.grey[300],
                            child: const Icon(Icons.image_not_supported),
                          ),
                        )
                      : Container(
                          color: Colors.grey[300],
                          child: isProcessing
                              ? const Center(
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.image_not_supported),
                        ),
                ),
              ),
              const SizedBox(width: 12),

              // Card info
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (isProcessing)
                      const Text(
                        'Processing...',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                        ),
                      )
                    else if (topCandidate != null) ...[
                      Text(
                        topCandidate.name,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${topCandidate.setName} (${topCandidate.setCode.toUpperCase()})',
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.grey[600],
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          _ConfidenceBadge(
                            confidence: scan.matchConfidence ?? 0,
                          ),
                          const SizedBox(width: 8),
                          if (topCandidate.priceUsd != null)
                            Text(
                              '\$${topCandidate.priceUsd}',
                              style: TextStyle(
                                fontSize: 13,
                                color: Colors.green[700],
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                        ],
                      ),
                    ] else
                      const Text(
                        'No match found',
                        style: TextStyle(color: Colors.orange),
                      ),

                    const SizedBox(height: 8),

                    // Action buttons
                    if (!isProcessing)
                      Row(
                        children: [
                          OutlinedButton.icon(
                            onPressed: onReject,
                            icon: const Icon(Icons.close, size: 18),
                            label: const Text('Reject'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.red,
                              visualDensity: VisualDensity.compact,
                            ),
                          ),
                          const SizedBox(width: 8),
                          ElevatedButton.icon(
                            onPressed: topCandidate != null ? onConfirm : null,
                            icon: const Icon(Icons.check, size: 18),
                            label: const Text('Confirm'),
                            style: ElevatedButton.styleFrom(
                              visualDensity: VisualDensity.compact,
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ConfidenceBadge extends StatelessWidget {
  final double confidence;

  const _ConfidenceBadge({required this.confidence});

  @override
  Widget build(BuildContext context) {
    final percent = (confidence * 100).toInt();
    Color color;
    if (confidence >= 0.9) {
      color = Colors.green;
    } else if (confidence >= 0.7) {
      color = Colors.orange;
    } else {
      color = Colors.red;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Text(
        '$percent% match',
        style: TextStyle(
          fontSize: 11,
          color: color,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}
