import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../../../../theme/app_theme.dart';
import '../../providers/scanner_provider.dart';
import '../../data/models/scan_models.dart';

class ScanReviewPage extends ConsumerStatefulWidget {
  final String batchId;

  const ScanReviewPage({super.key, required this.batchId});

  @override
  ConsumerState<ScanReviewPage> createState() => _ScanReviewPageState();
}

class _ScanReviewPageState extends ConsumerState<ScanReviewPage> {
  int _selectedCandidateIndex = 0;
  int _quantity = 1;

  @override
  void initState() {
    super.initState();
    ref.read(scannerProvider.notifier).refreshBatchStatus(widget.batchId);
  }

  @override
  Widget build(BuildContext context) {
    final scanState = ref.watch(scannerProvider);
    final currentScan = scanState.scanResults.isNotEmpty ? scanState.scanResults.first : null;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Review Scan ${scanState.scanResults.indexOf(currentScan ?? scanState.scanResults.first) + 1}/${scanState.scanResults.length}',
        ),
      ),
      body: currentScan == null
          ? const Center(child: Text('No scans to review'))
          : _buildReviewContent(context, ref, currentScan),
    );
  }

  Widget _buildReviewContent(BuildContext context, WidgetRef ref, ScanResult scan) {
    final candidates = scan.matchCandidates ?? [];
    final selectedCandidate = candidates.isNotEmpty && _selectedCandidateIndex < candidates.length
        ? candidates[_selectedCandidateIndex]
        : null;

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Scanned image vs matched card comparison
                Row(
                  children: [
                    // Scanned image
                    Expanded(
                      child: Column(
                        children: [
                          const Text(
                            'Your Scan',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 8),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: AspectRatio(
                              aspectRatio: 0.714,
                              child: scan.imageUrl != null
                                  ? CachedNetworkImage(
                                      imageUrl: scan.imageUrl!,
                                      fit: BoxFit.cover,
                                    )
                                  : Container(
                                      color: Colors.grey[300],
                                      child: const Icon(Icons.image),
                                    ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 16),
                    // Matched card
                    Expanded(
                      child: Column(
                        children: [
                          const Text(
                            'Best Match',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 8),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: AspectRatio(
                              aspectRatio: 0.714,
                              child: selectedCandidate?.imageUrl != null
                                  ? CachedNetworkImage(
                                      imageUrl: selectedCandidate!.imageUrl!,
                                      fit: BoxFit.cover,
                                    )
                                  : Container(
                                      color: Colors.grey[300],
                                      child: const Icon(Icons.help_outline),
                                    ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                // OCR extracted data
                if (scan.extractedData != null) ...[
                  Text(
                    'Extracted Text',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (scan.extractedData!.cardName != null)
                            _InfoRow('Name', scan.extractedData!.cardName!),
                          if (scan.extractedData!.typeLine != null)
                            _InfoRow('Type', scan.extractedData!.typeLine!),
                          if (scan.extractedData!.setCode != null)
                            _InfoRow('Set', scan.extractedData!.setCode!.toUpperCase()),
                          _InfoRow(
                            'OCR Confidence',
                            '${((scan.ocrConfidence ?? 0) * 100).toInt()}%',
                          ),
                        ],
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 16),

                // Match candidates
                if (candidates.isNotEmpty) ...[
                  Text(
                    'Possible Matches (${candidates.length})',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 150,
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      itemCount: candidates.length,
                      itemBuilder: (context, index) {
                        final candidate = candidates[index];
                        final isSelected = index == _selectedCandidateIndex;

                        return GestureDetector(
                          onTap: () => setState(() => _selectedCandidateIndex = index),
                          child: Container(
                            width: 100,
                            margin: const EdgeInsets.only(right: 8),
                            decoration: BoxDecoration(
                              border: Border.all(
                                color: isSelected ? AppTheme.accentColor : Colors.transparent,
                                width: 3,
                              ),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Column(
                              children: [
                                Expanded(
                                  child: ClipRRect(
                                    borderRadius: const BorderRadius.vertical(
                                      top: Radius.circular(5),
                                    ),
                                    child: candidate.imageUrl != null
                                        ? CachedNetworkImage(
                                            imageUrl: candidate.imageUrl!,
                                            fit: BoxFit.cover,
                                          )
                                        : Container(
                                            color: Colors.grey[300],
                                            child: const Icon(Icons.image),
                                          ),
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 4,
                                    vertical: 2,
                                  ),
                                  width: double.infinity,
                                  decoration: BoxDecoration(
                                    color: isSelected
                                        ? AppTheme.accentColor
                                        : Colors.grey[200],
                                    borderRadius: const BorderRadius.vertical(
                                      bottom: Radius.circular(5),
                                    ),
                                  ),
                                  child: Text(
                                    '${(candidate.confidence * 100).toInt()}%',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.bold,
                                      color: isSelected ? Colors.white : Colors.black87,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],

                const SizedBox(height: 16),

                // Selected card details
                if (selectedCandidate != null) ...[
                  Text(
                    'Selected Card',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            selectedCandidate.name,
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          _InfoRow('Set', '${selectedCandidate.setName} (${selectedCandidate.setCode.toUpperCase()})'),
                          if (selectedCandidate.collectorNumber != null)
                            _InfoRow('Collector #', selectedCandidate.collectorNumber!),
                          if (selectedCandidate.priceUsd != null)
                            _InfoRow('Price', '\$${selectedCandidate.priceUsd}'),
                        ],
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 16),

                // Quantity selector
                Text(
                  'Quantity',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton(
                      onPressed: _quantity > 1 ? () => setState(() => _quantity--) : null,
                      icon: const Icon(Icons.remove_circle_outline),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.grey[300]!),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        '$_quantity',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: _quantity < 99 ? () => setState(() => _quantity++) : null,
                      icon: const Icon(Icons.add_circle_outline),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),

        // Bottom action bar
        SafeArea(
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.1),
                  blurRadius: 8,
                  offset: const Offset(0, -2),
                ),
              ],
            ),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      ref.read(scannerProvider.notifier).rejectScan(scan.id);
                    },
                    child: const Text('Skip'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: ElevatedButton(
                    onPressed: selectedCandidate != null
                        ? () {
                            ref.read(scannerProvider.notifier).confirmScan(
                              scan.id,
                              selectedCandidate.scryfallId,
                              quantity: _quantity,
                            );
                          }
                        : null,
                    child: const Text('Add to Collection'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: TextStyle(
                color: Colors.grey[600],
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }
}
