import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// The printing plugin has no native side in tests: no renderer, so document tiles fall back to
/// an icon (after the raster timeout) and the preview says it can't render.
void fakePrinting() {
  const channel = MethodChannel('net.nfet.printing');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(
        channel,
        (call) async => switch (call.method) {
          'printingInfo' => <String, Object?>{
            'directPrint': false,
            'dynamicLayout': false,
            'canPrint': false,
            'canConvertHtml': false,
            'canShare': false,
            'canRaster': false,
            'canListPrinters': false,
          },
          _ => null,
        },
      );
  addTearDown(
    () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null),
  );
}
