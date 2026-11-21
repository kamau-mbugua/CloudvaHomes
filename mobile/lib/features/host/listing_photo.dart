import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

/// A listing photo as a small WebP copy, loaded with the host's login (so photos of hidden
/// listings show too) and kept in memory for the session. Widths: 160, 480 or 1024.
final listingPhotoBytesProvider =
    FutureProvider.family<Uint8List, ({String uploadId, int width})>(
      (ref, key) => ref
          .watch(apiClientProvider)
          .bytes('/uploads/${key.uploadId}/content', query: {'w': key.width}),
    );

class ListingPhotoImage extends ConsumerWidget {
  const ListingPhotoImage({
    super.key,
    required this.uploadId,
    this.width = 480,
    this.semanticLabel,
    this.fit = BoxFit.cover,
  });

  final String uploadId;
  final int width;
  final String? semanticLabel;
  final BoxFit fit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bytes = ref.watch(
      listingPhotoBytesProvider((uploadId: uploadId, width: width)),
    );
    const fallback = ColoredBox(
      color: Color(0xFFE4E8EE),
      child: Center(
        child: Icon(Icons.image_outlined, color: Color(0xFF9AA8B8)),
      ),
    );
    return bytes.when(
      data: (b) => Image.memory(
        b,
        fit: fit,
        gaplessPlayback: true,
        semanticLabel: semanticLabel,
        errorBuilder: (_, _, _) => fallback,
      ),
      loading: () => const ColoredBox(color: Color(0xFFEEF1F5)),
      error: (_, _) => fallback,
    );
  }
}
