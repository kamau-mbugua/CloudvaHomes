import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:image_picker_platform_interface/image_picker_platform_interface.dart';
import 'package:path_provider/path_provider.dart';

/// Stands in for the camera/gallery in live checks: returns a generated test image.
class FakeImagePicker extends ImagePickerPlatform {
  int picks = 0;

  @override
  Future<XFile?> getImageFromSource({
    required ImageSource source,
    ImagePickerOptions options = const ImagePickerOptions(),
  }) async {
    picks++;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawRect(
      const Rect.fromLTWH(0, 0, 640, 480),
      Paint()..color = const Color(0xFF002B4D),
    );
    canvas.drawCircle(
      const Offset(320, 240),
      120,
      Paint()..color = const Color(0xFF9DD000),
    );
    final image = await recorder.endRecording().toImage(640, 480);
    final png = await image.toByteData(format: ui.ImageByteFormat.png);
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/live-test-photo-$picks.png')
      ..writeAsBytesSync(png!.buffer.asUint8List());
    return XFile(file.path);
  }
}
