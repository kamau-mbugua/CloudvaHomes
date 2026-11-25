import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/widgets/common.dart';
import 'package:hodi/features/staff/units/units_screens.dart';

import 'helpers.dart';

Map<String, Object?> _unitJson({String? readiness}) => {
  'id': 'u1',
  'number': 'A4',
  'floor': 1,
  'sizeSqft': null,
  'rentAmount': 2500000,
  'description': null,
  'status': 'ACTIVE',
  'readiness': readiness,
  'property': {'id': 'p1', 'code': 'KC', 'name': 'Kilimani Court'},
  'unitType': {'id': 'ut1', 'name': '2 Bedroom'},
  'category': null,
  'features': const <Object?>[],
  'occupancy': 'VACANT',
  'currentTenancy': null,
};

void main() {
  testWidgets('unit detail with NEEDS_CLEANING shows Needs cleaning chip', (
    tester,
  ) async {
    final adapter = FakeAdapter({
      'GET /units/u1': (_) => {'data': _unitJson(readiness: 'NEEDS_CLEANING')},
    });
    await pumpScreen(
      tester,
      const UnitDetailScreen(unitId: 'u1'),
      adapter: adapter,
      permissions: {'units:view', 'units:update'},
    );

    expect(find.widgetWithText(StatusChip, 'Needs cleaning'), findsOneWidget);
    expect(find.byKey(const Key('unit-readiness-row')), findsOneWidget);
  });

  testWidgets(
    'with units:update, picking Ready sends PATCH {"readiness":"READY"} and Not set sends {"readiness":null}',
    (tester) async {
      String? currentReadiness;
      final adapter = FakeAdapter({
        'GET /units/u1': (_) => {
          'data': _unitJson(readiness: currentReadiness),
        },
        'PATCH /units/u1': (req) {
          final body = jsonDecode(jsonEncode(req.data)) as Map<String, dynamic>;
          currentReadiness = body['readiness'] as String?;
          return {'data': _unitJson(readiness: currentReadiness)};
        },
      });
      await pumpScreen(
        tester,
        const UnitDetailScreen(unitId: 'u1'),
        adapter: adapter,
        permissions: {'units:view', 'units:update'},
      );

      expect(find.text('Not set'), findsOneWidget);

      await tester.tap(find.byKey(const Key('unit-readiness-row')));
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(ListTile, 'Ready'));
      await tester.pumpAndSettle();

      final patches1 = adapter.sent('PATCH', '/units/u1');
      expect(patches1, hasLength(1));
      expect(jsonDecode(jsonEncode(patches1.single.data)), {
        'readiness': 'READY',
      });
      expect(find.text('Unit marked as Ready.'), findsOneWidget);
      expect(find.widgetWithText(StatusChip, 'Ready'), findsOneWidget);

      // Clear SnackBar before triggering the next action
      ScaffoldMessenger.of(
        tester.element(find.byType(UnitDetailScreen)),
      ).clearSnackBars();
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('unit-readiness-row')));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(ListTile, 'Not set'));
      await tester.pumpAndSettle();

      final patches2 = adapter.sent('PATCH', '/units/u1');
      expect(patches2, hasLength(2));
      expect(jsonDecode(jsonEncode(patches2.last.data)), {'readiness': null});
      expect(find.text('Readiness cleared.'), findsOneWidget);
      expect(find.widgetWithText(StatusChip, 'Ready'), findsNothing);
    },
  );

  testWidgets(
    'without units:update, shows chip when set and no Readiness row',
    (tester) async {
      final adapter = FakeAdapter({
        'GET /units/u1': (_) => {
          'data': _unitJson(readiness: 'NEEDS_CLEANING'),
        },
      });
      await pumpScreen(
        tester,
        const UnitDetailScreen(unitId: 'u1'),
        adapter: adapter,
        permissions: {'units:view'},
      );

      expect(find.widgetWithText(StatusChip, 'Needs cleaning'), findsOneWidget);
      expect(find.byKey(const Key('unit-readiness-row')), findsNothing);
      expect(find.text('Readiness'), findsNothing);
    },
  );

  testWidgets(
    'network error on PATCH shows no-connection message and keeps the old chip',
    (tester) async {
      final adapter = FakeAdapter({
        'GET /units/u1': (_) => {
          'data': _unitJson(readiness: 'NEEDS_CLEANING'),
        },
        'PATCH /units/u1': (_) => DropConnection(),
      });
      await pumpScreen(
        tester,
        const UnitDetailScreen(unitId: 'u1'),
        adapter: adapter,
        permissions: {'units:view', 'units:update'},
      );

      expect(find.widgetWithText(StatusChip, 'Needs cleaning'), findsOneWidget);

      await tester.tap(find.byKey(const Key('unit-readiness-row')));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(ListTile, 'Ready'));
      await tester.pumpAndSettle();

      expect(
        find.text("No connection. Try again when you're online."),
        findsOneWidget,
      );
      expect(find.widgetWithText(StatusChip, 'Needs cleaning'), findsOneWidget);
      expect(find.widgetWithText(StatusChip, 'Ready'), findsNothing);
    },
  );
}
