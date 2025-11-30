import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:camera/camera.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../../theme/app_theme.dart';
import '../../providers/scanner_provider.dart';

class ScanPage extends ConsumerStatefulWidget {
  const ScanPage({super.key});

  @override
  ConsumerState<ScanPage> createState() => _ScanPageState();
}

class _ScanPageState extends ConsumerState<ScanPage> with WidgetsBindingObserver {
  CameraController? _controller;
  List<CameraDescription>? _cameras;
  bool _isInitialized = false;
  bool _hasPermission = false;
  bool _isCapturing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initializeCamera();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_controller == null || !_controller!.value.isInitialized) {
      return;
    }

    if (state == AppLifecycleState.inactive) {
      _controller?.dispose();
    } else if (state == AppLifecycleState.resumed) {
      _initializeCamera();
    }
  }

  Future<void> _initializeCamera() async {
    // Check camera permission
    final status = await Permission.camera.request();
    if (!status.isGranted) {
      setState(() => _hasPermission = false);
      return;
    }
    setState(() => _hasPermission = true);

    try {
      _cameras = await availableCameras();
      if (_cameras == null || _cameras!.isEmpty) {
        return;
      }

      _controller = CameraController(
        _cameras!.first,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );

      await _controller!.initialize();
      
      if (mounted) {
        setState(() => _isInitialized = true);
      }
    } catch (e) {
      debugPrint('Error initializing camera: $e');
    }
  }

  Future<void> _captureCard() async {
    if (_controller == null || !_controller!.value.isInitialized || _isCapturing) {
      return;
    }

    setState(() => _isCapturing = true);

    try {
      final image = await _controller!.takePicture();
      
      // Add to scanning queue
      await ref.read(scannerProvider.notifier).captureCard(image.path);
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.check_circle, color: Colors.white),
                const SizedBox(width: 8),
                Text('Card captured! ${ref.read(scannerProvider).capturedCount} cards in queue'),
              ],
            ),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 1),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error capturing card: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isCapturing = false);
      }
    }
  }

  void _openGallery() async {
    await ref.read(scannerProvider.notifier).pickFromGallery();
  }

  void _uploadBatch() async {
    final state = ref.read(scannerProvider);
    if (state.capturedImages.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No cards captured yet!'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    await ref.read(scannerProvider.notifier).uploadBatch();
    
    if (mounted) {
      context.push('/scan/results');
    }
  }

  @override
  Widget build(BuildContext context) {
    final scanState = ref.watch(scannerProvider);

    if (!_hasPermission) {
      return Scaffold(
        appBar: AppBar(title: const Text('Scan Cards')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.camera_alt_outlined, size: 64, color: Colors.grey),
              const SizedBox(height: 16),
              const Text(
                'Camera permission is required',
                style: TextStyle(fontSize: 18),
              ),
              const SizedBox(height: 8),
              const Text(
                'Please enable camera access in settings',
                style: TextStyle(color: Colors.grey),
              ),
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: () => openAppSettings(),
                icon: const Icon(Icons.settings),
                label: const Text('Open Settings'),
              ),
            ],
          ),
        ),
      );
    }

    if (!_isInitialized || _controller == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Scan Cards')),
        body: const Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Camera Preview
          Positioned.fill(
            child: CameraPreview(_controller!),
          ),

          // Card overlay guide
          Positioned.fill(
            child: CustomPaint(
              painter: CardOverlayPainter(),
            ),
          ),

          // Top bar
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withOpacity(0.7),
                      Colors.transparent,
                    ],
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Scan Cards',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppTheme.accentColor,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(
                        '${scanState.capturedCount} cards',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // Instructions
          Positioned(
            left: 0,
            right: 0,
            bottom: 200,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: const Text(
                'Position card within the frame',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 16,
                ),
              ),
            ),
          ),

          // Bottom controls
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [
                    Colors.black.withOpacity(0.9),
                    Colors.transparent,
                  ],
                ),
              ),
              child: SafeArea(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Capture controls
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        // Gallery button
                        IconButton(
                          onPressed: _openGallery,
                          icon: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.white24,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(
                              Icons.photo_library_outlined,
                              color: Colors.white,
                              size: 28,
                            ),
                          ),
                        ),

                        // Capture button
                        GestureDetector(
                          onTap: _isCapturing ? null : _captureCard,
                          child: Container(
                            width: 80,
                            height: 80,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white, width: 4),
                            ),
                            child: Container(
                              margin: const EdgeInsets.all(4),
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: _isCapturing 
                                  ? Colors.grey 
                                  : AppTheme.accentColor,
                              ),
                              child: _isCapturing
                                ? const Center(
                                    child: SizedBox(
                                      width: 30,
                                      height: 30,
                                      child: CircularProgressIndicator(
                                        color: Colors.white,
                                        strokeWidth: 3,
                                      ),
                                    ),
                                  )
                                : const Icon(
                                    Icons.camera_alt,
                                    color: Colors.white,
                                    size: 36,
                                  ),
                            ),
                          ),
                        ),

                        // Upload button
                        IconButton(
                          onPressed: scanState.capturedCount > 0 ? _uploadBatch : null,
                          icon: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: scanState.capturedCount > 0 
                                ? AppTheme.accentColor 
                                : Colors.white24,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(
                              Icons.cloud_upload_outlined,
                              color: scanState.capturedCount > 0 
                                ? Colors.white 
                                : Colors.white54,
                              size: 28,
                            ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 16),

                    // Quick tips
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.tips_and_updates, color: Colors.amber, size: 16),
                        const SizedBox(width: 8),
                        Text(
                          'Tap capture or swipe to scan multiple cards',
                          style: TextStyle(
                            color: Colors.white.withOpacity(0.7),
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class CardOverlayPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.black.withOpacity(0.5)
      ..style = PaintingStyle.fill;

    // Card aspect ratio (Magic cards are 2.5" x 3.5")
    const cardAspectRatio = 2.5 / 3.5;
    
    final cardWidth = size.width * 0.75;
    final cardHeight = cardWidth / cardAspectRatio;
    
    final cardRect = Rect.fromCenter(
      center: Offset(size.width / 2, size.height / 2 - 40),
      width: cardWidth,
      height: cardHeight,
    );

    // Draw darkened overlay
    final path = Path()
      ..addRect(Rect.fromLTWH(0, 0, size.width, size.height))
      ..addRRect(RRect.fromRectAndRadius(cardRect, const Radius.circular(12)))
      ..fillType = PathFillType.evenOdd;
    
    canvas.drawPath(path, paint);

    // Draw card border
    final borderPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;

    canvas.drawRRect(
      RRect.fromRectAndRadius(cardRect, const Radius.circular(12)),
      borderPaint,
    );

    // Draw corner brackets
    final bracketPaint = Paint()
      ..color = AppTheme.accentColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4;

    const bracketLength = 30.0;
    
    // Top-left corner
    canvas.drawLine(
      Offset(cardRect.left, cardRect.top + bracketLength),
      Offset(cardRect.left, cardRect.top),
      bracketPaint,
    );
    canvas.drawLine(
      Offset(cardRect.left, cardRect.top),
      Offset(cardRect.left + bracketLength, cardRect.top),
      bracketPaint,
    );

    // Top-right corner
    canvas.drawLine(
      Offset(cardRect.right - bracketLength, cardRect.top),
      Offset(cardRect.right, cardRect.top),
      bracketPaint,
    );
    canvas.drawLine(
      Offset(cardRect.right, cardRect.top),
      Offset(cardRect.right, cardRect.top + bracketLength),
      bracketPaint,
    );

    // Bottom-left corner
    canvas.drawLine(
      Offset(cardRect.left, cardRect.bottom - bracketLength),
      Offset(cardRect.left, cardRect.bottom),
      bracketPaint,
    );
    canvas.drawLine(
      Offset(cardRect.left, cardRect.bottom),
      Offset(cardRect.left + bracketLength, cardRect.bottom),
      bracketPaint,
    );

    // Bottom-right corner
    canvas.drawLine(
      Offset(cardRect.right - bracketLength, cardRect.bottom),
      Offset(cardRect.right, cardRect.bottom),
      bracketPaint,
    );
    canvas.drawLine(
      Offset(cardRect.right, cardRect.bottom),
      Offset(cardRect.right, cardRect.bottom - bracketLength),
      bracketPaint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
