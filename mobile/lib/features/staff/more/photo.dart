import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/widgets/common.dart';

/// The longest side a photo is sent at.
const maxPhotoSide = 1600;

/// Camera or gallery → a JPEG no larger than [maxPhotoSide] on its longest side. Null when
/// the person cancels. The picker scales it down; the compressor re-encodes it as JPEG
/// (HEIC from iPhones included) without scaling it further.
Future<Uint8List?> pickPhoto(BuildContext context) async {
  final source = await showModalBottomSheet<ImageSource>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: const Text('Take a photo'),
            onTap: () => Navigator.of(ctx).pop(ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Choose from gallery'),
            onTap: () => Navigator.of(ctx).pop(ImageSource.gallery),
          ),
        ],
      ),
    ),
  );
  if (source == null) return null;
  try {
    final file = await ImagePicker().pickImage(
      source: source,
      maxWidth: maxPhotoSide.toDouble(),
      maxHeight: maxPhotoSide.toDouble(),
    );
    if (file == null) return null;
    final jpeg = await FlutterImageCompress.compressWithFile(
      file.path,
      minWidth: maxPhotoSide,
      minHeight: maxPhotoSide,
      quality: 80,
      format: CompressFormat.jpeg,
    );
    if (jpeg == null && context.mounted) {
      showMessage(context, 'Couldn’t read that photo. Try another.');
    }
    return jpeg;
  } catch (_) {
    if (context.mounted) {
      showMessage(
        context,
        'Couldn’t open the ${source == ImageSource.camera ? 'camera' : 'gallery'}. Check the app’s permissions in Settings.',
      );
    }
    return null;
  }
}

/// A picked photo's preview with Change / Remove, or an "Add photo" button.
class PhotoField extends StatelessWidget {
  const PhotoField({
    super.key,
    required this.label,
    required this.photo,
    required this.onPick,
    required this.onRemove,
    this.error,
  });
  final String label;
  final Uint8List? photo;
  final VoidCallback onPick;
  final VoidCallback onRemove;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (photo == null)
          OutlinedButton.icon(
            icon: const Icon(Icons.add_a_photo_outlined),
            label: Text(label),
            onPressed: onPick,
          )
        else
          Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.memory(
                  photo!,
                  width: 72,
                  height: 72,
                  fit: BoxFit.cover,
                  semanticLabel: label,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text('${(photo!.length / 1024).round()} KB photo'),
              ),
              IconButton(
                tooltip: 'Change photo',
                icon: const Icon(Icons.edit_outlined),
                onPressed: onPick,
              ),
              IconButton(
                tooltip: 'Remove photo',
                icon: const Icon(Icons.delete_outline),
                onPressed: onRemove,
              ),
            ],
          ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              error!,
              style: TextStyle(color: scheme.error, fontSize: 12),
            ),
          ),
      ],
    );
  }
}
