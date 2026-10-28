import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/staff/money/money_screens.dart';
import 'package:hodi/features/staff/units/units_screens.dart';

import 'helpers.dart';
import 'permissions_test.dart' show inboundJson;

Map<String, Object?> _unit(String id, String number) => {
  'id': id,
  'number': number,
  'floor': 0,
  'sizeSqft': null,
  'rentAmount': 1500000,
  'description': null,
  'status': 'ACTIVE',
  'property': {'id': 'pr1', 'code': 'TC', 'name': 'Test Court'},
  'unitType': null,
  'category': null,
  'features': [],
  'occupancy': 'VACANT',
  'currentTenancy': null,
};

Future<void> _chip(WidgetTester tester, String label) async {
  final chip = find.widgetWithText(ChoiceChip, label);
  await tester.ensureVisible(chip);
  await tester.pumpAndSettle();
  await tester.tap(chip);
}

void main() {
  testWidgets('units filters send the right query', (tester) async {
    final adapter = FakeAdapter({
      'GET /units': (_) => page([_unit('un1', 'A1')]),
      'GET /properties': (_) => page([
        {'id': 'pr1', 'code': 'TC', 'name': 'Test Court'},
        {'id': 'pr2', 'code': 'OV', 'name': 'Other View'},
      ]),
    });
    await pumpScreen(
      tester,
      const UnitsScreen(),
      adapter: adapter,
      permissions: {'units:view', 'properties:view'},
    );
    Map<String, dynamic> last() =>
        adapter.sent('GET', '/units').last.queryParameters;

    expect(last(), {'page': 1, 'pageSize': 20});
    expect(find.text('A1 · Test Court'), findsOneWidget);
    // Unpaged-by-mistake guard: the property picker asks for active properties.
    expect(adapter.sent('GET', '/properties').single.queryParameters, {
      'status': 'ACTIVE',
      'pageSize': 100,
    });
    await _chip(tester, 'Vacant');
    await tester.pumpAndSettle();
    expect(last(), {'page': 1, 'pageSize': 20, 'occupancy': 'VACANT'});

    await _chip(tester, 'Let');
    await tester.pumpAndSettle();
    expect(last()['occupancy'], 'OCCUPIED');

    await tester.ensureVisible(find.text('All properties'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('All properties'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Other View'));
    await tester.pumpAndSettle();
    expect(last(), {
      'page': 1,
      'pageSize': 20,
      'occupancy': 'OCCUPIED',
      'propertyId': 'pr2',
    });

    await tester.enterText(find.byType(TextField), 'amina');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(last(), {
      'page': 1,
      'pageSize': 20,
      'q': 'amina',
      'occupancy': 'OCCUPIED',
      'propertyId': 'pr2',
    });

    await _chip(tester, 'All');
    await tester.pumpAndSettle();
    expect(last().containsKey('occupancy'), isFalse);
  });

  testWidgets('assigning an unmatched M-Pesa payment to a suggested tenant', (
    tester,
  ) async {
    var assigned = false;
    final adapter = FakeAdapter({
      'GET /inbound-transactions/x1': (_) => {
        'data': inboundJson(status: assigned ? 'MATCHED' : 'UNMATCHED'),
      },
      'POST /inbound-transactions/x1/assign': (_) {
        assigned = true;
        return {'data': inboundJson(status: 'MATCHED')};
      },
    });
    await pumpScreen(
      tester,
      const InboundDetailScreen(inboundId: 'x1'),
      adapter: adapter,
      permissions: {
        'reconciliation:view',
        'reconciliation:update',
        'tenants:view',
      },
    );
    expect(find.textContaining('Phone matches'), findsOneWidget);

    await tester.tap(find.widgetWithText(TextButton, 'Assign'));
    await tester.pumpAndSettle();
    expect(find.text('Assign this payment?'), findsOneWidget);
    await tester.tap(find.widgetWithText(TextButton, 'Assign').last);
    await tester.pumpAndSettle();

    final posts = adapter.sent('POST', '/inbound-transactions/x1/assign');
    expect(posts, hasLength(1));
    expect(posts.single.data, {'tenantId': 't1'});
    expect(
      find.text('Recorded as RCT-2026-000099 for Amina Test.'),
      findsOneWidget,
    );
    // Re-read: now matched, so the actions are gone.
    expect(find.text('Matched'), findsOneWidget);
    expect(find.byKey(const Key('inbound-assign')), findsNothing);
  });

  testWidgets('ignore needs a reason and posts it', (tester) async {
    final adapter = FakeAdapter({
      'GET /inbound-transactions/x1': (_) => {'data': inboundJson()},
      'POST /inbound-transactions/x1/ignore': (_) => {'data': inboundJson()},
    });
    await pumpScreen(
      tester,
      const InboundDetailScreen(inboundId: 'x1'),
      adapter: adapter,
      permissions: {'reconciliation:view', 'reconciliation:update'},
    );
    await tester.ensureVisible(find.byKey(const Key('inbound-ignore')));
    await tester.tap(find.byKey(const Key('inbound-ignore')));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton, 'Ignore'));
    await tester.pumpAndSettle();
    expect(find.text('Say why, in a few words.'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Supplier refund');
    await tester.tap(find.widgetWithText(TextButton, 'Ignore'));
    await tester.pumpAndSettle();
    expect(
      adapter.sent('POST', '/inbound-transactions/x1/ignore').single.data,
      {'reason': 'Supplier refund'},
    );
  });
}
