import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/staff/tenants/inspection_screen.dart';

import 'helpers.dart';

void main() {
  testWidgets(
    'a move-out lists the move-in areas, flags worse ones and saves the checklist',
    (tester) async {
      Map<String, dynamic>? sent;
      final adapter = FakeAdapter({
        'GET /tenancies/ty1/inspections': (_) => {
          'data': [
            {
              'id': 'i1',
              'kind': 'MOVE_IN',
              'inspectedOn': '2026-03-01',
              'items': [
                {
                  'area': 'Kitchen',
                  'condition': 'GOOD',
                  'photoUploadIds': <String>[],
                },
                {
                  'area': 'Floors',
                  'condition': 'FAIR',
                  'photoUploadIds': <String>[],
                },
              ],
              'notes': null,
              'inspectorName': null,
              'tenantAcknowledgedAt': '2026-03-02T08:00:00Z',
            },
          ],
        },
        'PUT /tenancies/ty1/inspections/MOVE_OUT': (r) {
          sent =
              (r.data is String ? jsonDecode(r.data as String) : r.data)
                  as Map<String, dynamic>;
          return {
            'data': {
              'id': 'i2',
              'kind': 'MOVE_OUT',
              'inspectedOn': '2026-11-04',
              'items': sent!['items'],
              'tenantAcknowledgedAt': null,
            },
          };
        },
      });
      await pumpScreen(
        tester,
        const InspectionScreen(
          tenancyId: 'ty1',
          kind: 'MOVE_OUT',
          title: 'A1 · Sam Tenant',
        ),
        adapter: adapter,
        permissions: {'tenancies:view', 'tenancies:update'},
      );

      // Starts from the move-in areas, each with its move-in condition.
      expect(find.text('Kitchen'), findsOneWidget);
      expect(find.text('Floors'), findsOneWidget);
      expect(find.text('At move-in: Good'), findsOneWidget);

      // Kitchen got worse.
      await tester.tap(find.widgetWithText(ChoiceChip, 'Poor').first);
      await tester.pumpAndSettle();
      expect(find.text('At move-in: Good — worse now'), findsOneWidget);

      await tester.scrollUntilVisible(
        find.text('Save inspection'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Save inspection'));
      await tester.pumpAndSettle();

      expect(
        adapter.sent('PUT', '/tenancies/ty1/inspections/MOVE_OUT'),
        hasLength(1),
      );
      final items = sent!['items'] as List;
      expect(items.map((i) => [(i as Map)['area'], i['condition']]).toList(), [
        ['Kitchen', 'POOR'],
        ['Floors', 'GOOD'],
      ]);
    },
  );
}
