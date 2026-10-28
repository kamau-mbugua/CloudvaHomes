import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

/// Live checks against a local API with the dev data (see README). Not part of `flutter test`.
const otpLog = String.fromEnvironment('OTP_LOG');

/// Pumps until [finder] shows (real time), or fails after [timeout].
Future<void> waitFor(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 20),
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 200));
    if (finder.evaluate().isNotEmpty) return;
  }
  throw TestFailure('Timed out waiting for $finder');
}

Future<void> tapOn(WidgetTester tester, Finder finder) async {
  await waitFor(tester, finder);
  await tester.ensureVisible(finder.first);
  await tester.pump(const Duration(milliseconds: 300));
  await tester.tap(finder.first);
  await tester.pump(const Duration(milliseconds: 300));
}

Future<void> typeInto(WidgetTester tester, String label, String text) async {
  final f = find.widgetWithText(TextField, label);
  await waitFor(tester, f);
  await tester.enterText(f.first, text);
  await tester.pump();
}

/// How many codes of [kind] the dev API has logged so far.
int codeCount({String kind = 'sign-in'}) {
  final f = File(otpLog);
  return f.existsSync()
      ? RegExp('$kind code is (\\d{6})').allMatches(f.readAsStringSync()).length
      : 0;
}

/// The first code of [kind] logged after there were [before] of them.
Future<String> nextCode(int before, {String kind = 'sign-in'}) async {
  final end = DateTime.now().add(const Duration(seconds: 15));
  final re = RegExp('$kind code is (\\d{6})');
  while (DateTime.now().isBefore(end)) {
    final f = File(otpLog);
    if (f.existsSync()) {
      final matches = re.allMatches(f.readAsStringSync()).toList();
      if (matches.length > before) return matches.last.group(1)!;
    }
    await Future<void>.delayed(const Duration(milliseconds: 300));
  }
  throw TestFailure('No new $kind code in $otpLog');
}

Future<void> shot(
  IntegrationTestWidgetsFlutterBinding binding,
  WidgetTester tester,
  String name,
) async {
  await tester.pump(const Duration(milliseconds: 500));
  await binding.convertFlutterSurfaceToImage();
  await tester.pump();
  await binding.takeScreenshot(name);
}
