import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:equatable/equatable.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../../../network/api_constants.dart';
import '../../../network/dio_client.dart';
import '../data/models/scan_models.dart';

// Scanner State
class ScannerState extends Equatable {
  final List<String> capturedImages;
  final bool isUploading;
  final double uploadProgress;
  final String? currentBatchId;
  final List<ScanResult> scanResults;
  final String? errorMessage;

  const ScannerState({
    this.capturedImages = const [],
    this.isUploading = false,
    this.uploadProgress = 0,
    this.currentBatchId,
    this.scanResults = const [],
    this.errorMessage,
  });

  int get capturedCount => capturedImages.length;

  ScannerState copyWith({
    List<String>? capturedImages,
    bool? isUploading,
    double? uploadProgress,
    String? currentBatchId,
    List<ScanResult>? scanResults,
    String? errorMessage,
  }) {
    return ScannerState(
      capturedImages: capturedImages ?? this.capturedImages,
      isUploading: isUploading ?? this.isUploading,
      uploadProgress: uploadProgress ?? this.uploadProgress,
      currentBatchId: currentBatchId ?? this.currentBatchId,
      scanResults: scanResults ?? this.scanResults,
      errorMessage: errorMessage,
    );
  }

  @override
  List<Object?> get props => [
        capturedImages,
        isUploading,
        uploadProgress,
        currentBatchId,
        scanResults,
        errorMessage,
      ];
}

// Scanner Notifier
class ScannerNotifier extends StateNotifier<ScannerState> {
  final Ref _ref;
  final ImagePicker _picker = ImagePicker();

  ScannerNotifier(this._ref) : super(const ScannerState());

  Dio get _dio => _ref.read(dioProvider);

  Future<void> captureCard(String imagePath) async {
    state = state.copyWith(
      capturedImages: [...state.capturedImages, imagePath],
    );
  }

  Future<void> pickFromGallery() async {
    try {
      final images = await _picker.pickMultiImage(
        imageQuality: 90,
        maxWidth: 1920,
        maxHeight: 1920,
      );

      if (images.isNotEmpty) {
        final paths = images.map((img) => img.path).toList();
        state = state.copyWith(
          capturedImages: [...state.capturedImages, ...paths],
        );
      }
    } catch (e) {
      state = state.copyWith(errorMessage: 'Failed to pick images: $e');
    }
  }

  void removeImage(int index) {
    if (index >= 0 && index < state.capturedImages.length) {
      final newImages = List<String>.from(state.capturedImages);
      newImages.removeAt(index);
      state = state.copyWith(capturedImages: newImages);
    }
  }

  Future<void> uploadBatch({String? collectionId}) async {
    if (state.capturedImages.isEmpty) return;

    state = state.copyWith(isUploading: true, uploadProgress: 0, errorMessage: null);

    try {
      // Create batch first
      final batchResponse = await _dio.post(
        ApiConstants.scanBatches,
        data: {
          if (collectionId != null) 'collection_id': collectionId,
          'device_info': {
            'platform': Platform.operatingSystem,
            'version': Platform.operatingSystemVersion,
          },
        },
      );

      final batchId = batchResponse.data['id'];
      state = state.copyWith(currentBatchId: batchId);

      // Upload each image
      final List<ScanResult> results = [];
      for (int i = 0; i < state.capturedImages.length; i++) {
        final imagePath = state.capturedImages[i];
        final file = File(imagePath);

        if (!await file.exists()) continue;

        final formData = FormData.fromMap({
          'file': await MultipartFile.fromFile(
            imagePath,
            filename: '${const Uuid().v4()}.jpg',
          ),
          'batch_id': batchId,
        });

        final response = await _dio.post(
          ApiConstants.scanUpload,
          data: formData,
          options: Options(
            headers: {'Content-Type': 'multipart/form-data'},
          ),
        );

        results.add(ScanResult.fromJson(response.data));

        // Update progress
        state = state.copyWith(
          uploadProgress: (i + 1) / state.capturedImages.length,
        );
      }

      state = state.copyWith(
        scanResults: results,
        isUploading: false,
        capturedImages: [],
      );
    } catch (e) {
      state = state.copyWith(
        isUploading: false,
        errorMessage: 'Upload failed: $e',
      );
    }
  }

  Future<void> refreshBatchStatus(String batchId) async {
    try {
      final response = await _dio.get(ApiConstants.scanBatch(batchId));
      final batch = ScanBatch.fromJson(response.data);
      
      // Get individual scan results
      final scansResponse = await _dio.get(
        ApiConstants.pendingScans,
        queryParameters: {'batch_id': batchId},
      );
      
      final scans = (scansResponse.data['scans'] as List)
          .map((s) => ScanResult.fromJson(s))
          .toList();
      
      state = state.copyWith(scanResults: scans);
    } catch (e) {
      state = state.copyWith(errorMessage: 'Failed to refresh: $e');
    }
  }

  Future<void> confirmScan(String scanId, String cardId, {int quantity = 1}) async {
    try {
      await _dio.post(
        ApiConstants.scanConfirm(scanId),
        data: {
          'confirmed_card_id': cardId,
          'quantity': quantity,
        },
      );

      // Update local state
      final updatedResults = state.scanResults.map((r) {
        if (r.id == scanId) {
          return r.copyWith(status: 'completed', userConfirmed: true);
        }
        return r;
      }).toList();

      state = state.copyWith(scanResults: updatedResults);
    } catch (e) {
      state = state.copyWith(errorMessage: 'Failed to confirm: $e');
    }
  }

  Future<void> rejectScan(String scanId, {String? reason}) async {
    try {
      await _dio.post(
        ApiConstants.scanReject(scanId),
        data: {
          if (reason != null) 'reason': reason,
        },
      );

      // Remove from local state
      final updatedResults = state.scanResults
          .where((r) => r.id != scanId)
          .toList();

      state = state.copyWith(scanResults: updatedResults);
    } catch (e) {
      state = state.copyWith(errorMessage: 'Failed to reject: $e');
    }
  }

  Future<void> confirmAllScans(String batchId) async {
    try {
      await _dio.post(ApiConstants.batchConfirm(batchId));

      // Clear results
      state = state.copyWith(
        scanResults: [],
        currentBatchId: null,
      );
    } catch (e) {
      state = state.copyWith(errorMessage: 'Failed to confirm batch: $e');
    }
  }

  void clearState() {
    state = const ScannerState();
  }
}

// Provider
final scannerProvider = StateNotifierProvider<ScannerNotifier, ScannerState>((ref) {
  return ScannerNotifier(ref);
});
