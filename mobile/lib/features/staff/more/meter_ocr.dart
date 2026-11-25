import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

import 'photo.dart';
import 'reading_checks.dart';

final _hasDigit = RegExp(r'\d');
final _letter = RegExp(r'[\p{L}\u00B2\u00B3\u00B9]', unicode: true);
final _numberRun = RegExp(r'\d+(?:[.,]\d+)*');
final _spacedDigitsLine = RegExp(r'^\d+(?:\s+\d+)+$');

class _Candidate {
  const _Candidate(this.value, this.milliValue, this.digitCount);
  final String value;
  final int milliValue;
  final int digitCount;
}

String _normaliseLookalikes(String token) {
  if (!_hasDigit.hasMatch(token)) return token;
  return token
      .replaceAll('O', '0')
      .replaceAll('o', '0')
      .replaceAll('I', '1')
      .replaceAll('l', '1')
      .replaceAll('|', '1');
}

String _stripLeadingZeros(String raw) {
  final parts = raw.split('.');
  final whole = parts[0].replaceFirst(RegExp(r'^0+(?=\d)'), '');
  return parts.length == 2 ? '$whole.${parts[1]}' : whole;
}

_Candidate? _parseCandidate(String raw, String? serialDigits) {
  final normalisedSep = raw.replaceAll(',', '.');
  final parts = normalisedSep.split('.');
  if (parts.length > 2) return null;
  final whole = parts[0];
  final frac = parts.length == 2 ? parts[1] : null;
  if (whole.isEmpty || whole.length > 9) return null;
  if (frac != null && (frac.isEmpty || frac.length > 3)) return null;

  final rawDigits = frac == null ? whole : '$whole$frac';
  if (serialDigits != null && rawDigits == serialDigits) return null;

  final stripped = _stripLeadingZeros(normalisedSep);
  final valid = normaliseQuantity(stripped);
  if (valid == null) return null;
  return _Candidate(valid, milli(valid), rawDigits.length);
}

/// Picks the most likely meter reading from OCR [text], or `null` when no plausible
/// quantity is found.
String? suggestReading(String text, {String? previous, String? serialNo}) {
  if (text.trim().isEmpty) return null;

  final rawSerialDigits = serialNo?.replaceAll(RegExp(r'\D'), '') ?? '';
  final serialDigits = rawSerialDigits.length >= 4 ? rawSerialDigits : null;

  final candidates = <_Candidate>[];
  for (final rawLine in text.split(RegExp(r'\r?\n'))) {
    final trimmedLine = rawLine.trim();
    if (trimmedLine.isEmpty) continue;

    for (final rawToken in trimmedLine.split(RegExp(r'\s+'))) {
      if (rawToken.isEmpty) continue;
      final token = _normaliseLookalikes(rawToken);
      for (final m in _numberRun.allMatches(token)) {
        final start = m.start;
        final end = m.end;
        if (start > 0 && _letter.hasMatch(token[start - 1])) continue;
        if (end < token.length && _letter.hasMatch(token[end])) continue;
        final c = _parseCandidate(m.group(0)!, serialDigits);
        if (c != null) candidates.add(c);
      }
    }

    if (_spacedDigitsLine.hasMatch(trimmedLine)) {
      final joined = trimmedLine.replaceAll(' ', '');
      final c = _parseCandidate(joined, serialDigits);
      if (c != null) candidates.add(c);
    }
  }

  if (candidates.isEmpty) return null;

  final prevNorm = previous == null ? null : normaliseQuantity(previous);
  if (prevNorm != null) {
    final prevMilli = milli(prevNorm);
    _Candidate? best;
    var bestDiff = 0;
    for (final c in candidates) {
      if (c.milliValue < prevMilli) continue;
      final diff = c.milliValue - prevMilli;
      if (best == null ||
          diff < bestDiff ||
          (diff == bestDiff && c.digitCount > best.digitCount)) {
        best = c;
        bestDiff = diff;
      }
    }
    return best?.value;
  }

  var best = candidates.first;
  for (final c in candidates.skip(1)) {
    if (c.digitCount > best.digitCount) best = c;
  }
  return best.value;
}

/// On-device OCR reader for meter photos. Implementations return `null` on failure.
abstract class MeterOcr {
  Future<String?> readText(Uint8List jpeg);
}

/// Latin-script ML Kit reader used on Android and iOS. The photo and text stay on-device.
class MlKitMeterOcr implements MeterOcr {
  final TextRecognizer _recognizer = TextRecognizer(
    script: TextRecognitionScript.latin,
  );
  static int _seq = 0;

  @override
  Future<String?> readText(Uint8List jpeg) async {
    File? tempFile;
    try {
      tempFile = File(
        '${Directory.systemTemp.path}/kodihq_meter_ocr_'
        '${DateTime.now().microsecondsSinceEpoch}_${_seq++}.jpg',
      );
      await tempFile.writeAsBytes(jpeg, flush: true);
      final result = await _recognizer.processImage(
        InputImage.fromFilePath(tempFile.path),
      );
      return result.text;
    } on Object {
      return null;
    } finally {
      if (tempFile != null) {
        try {
          if (await tempFile.exists()) await tempFile.delete();
        } on Object {
          // Ignore temp cleanup errors.
        }
      }
    }
  }

  Future<void> close() async {
    try {
      await _recognizer.close();
    } on Object {
      // Ignore close errors on teardown.
    }
  }
}

/// No-op reader for desktop platforms and tests unless overridden.
class NoMeterOcr implements MeterOcr {
  const NoMeterOcr();

  @override
  Future<String?> readText(Uint8List jpeg) async => null;
}

/// ML Kit on phones; nothing elsewhere (desktop, and `flutter test`, which runs as the
/// host OS). Tests that need OCR override this provider.
final meterOcrProvider = Provider<MeterOcr>((ref) {
  if (Platform.isAndroid || Platform.isIOS) {
    final ocr = MlKitMeterOcr();
    ref.onDispose(() => unawaited(ocr.close()));
    return ocr;
  }
  return const NoMeterOcr();
});

typedef MeterPhotoPicker = Future<Uint8List?> Function(BuildContext context);

final meterPhotoPickerProvider = Provider<MeterPhotoPicker>((ref) => pickPhoto);
