import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/theme.dart';

Widget _chip(String kind, bool selected) => switch (kind) {
  'FilterChip' => FilterChip(
    label: const Text('All'),
    selected: selected,
    onSelected: (_) {},
  ),
  _ => ChoiceChip(
    label: const Text('All'),
    selected: selected,
    onSelected: (_) {},
  ),
};

Color _labelColor(WidgetTester tester) =>
    (tester.renderObject(find.text('All')) as RenderParagraph)
        .text
        .style!
        .color!;

void main() {
  for (final brightness in Brightness.values) {
    for (final kind in ['ChoiceChip', 'FilterChip']) {
      testWidgets(
        'a selected $kind label stays readable on its fill ($brightness)',
        (tester) async {
          final theme = hodiTheme(brightness);
          Future<void> pump(bool selected) => tester.pumpWidget(
            MaterialApp(
              theme: theme,
              home: Scaffold(body: Center(child: _chip(kind, selected))),
            ),
          );

          await pump(true);
          expect(
            _labelColor(tester),
            brightness == Brightness.dark ? HodiColors.navy : Colors.white,
          );

          await pump(false);
          expect(_labelColor(tester), theme.colorScheme.onSurface);
        },
      );
    }
  }
}
