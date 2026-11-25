import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/theme.dart';
import 'package:hodi/features/staff/home/home_screen.dart';
import 'package:hodi/features/staff/more/parity_screens.dart';

import 'helpers.dart';

Map<String, Object?> _dashboard() => {
  'period': '2026-10',
  'invoiced': 12000000,
  'collected': 9000000,
  'collectionRate': 0.75,
  'arrears': 3000000,
  'expenses': 100000,
  'net': 8900000,
  'occupancy': {
    'units': 10,
    'occupied': 7,
    'notice': 1,
    'vacant': 2,
    'unavailable': 0,
    'rate': 0.8,
  },
  'unmatchedMpesa': 2,
  'topOverdue': [
    {
      'tenant': tenantRefJson(),
      'overdue': 1500000,
      'oldestDueDate': '2026-09-05',
    },
  ],
  'trend': [],
  'asOf': '2026-10-28',
};

Future<void> _pump(
  WidgetTester tester,
  FakeAdapter adapter,
  Set<String> perms,
) async {
  phoneSize(tester);
  await tester.pumpWidget(
    ProviderScope(
      overrides: overridesFor(adapter, perms),
      child: MaterialApp(
        theme: hodiTheme(Brightness.light),
        darkTheme: hodiTheme(Brightness.dark),
        themeMode: ThemeMode.dark,
        home: const StaffHomeScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('dashboard figures and quick actions (dark, 360 wide)', (
    tester,
  ) async {
    final adapter = FakeAdapter({
      'GET /reports/dashboard': (_) => {'data': _dashboard()},
    });
    await _pump(tester, adapter, {
      'reports:view',
      'payments:create',
      'meters:create',
      'expenses:create',
      'tenants:view',
    });
    expect(
      adapter.sent('GET', '/reports/dashboard').single.queryParameters,
      isEmpty,
    );
    expect(find.text('KES 120,000.00'), findsOneWidget);
    expect(find.text('KES 90,000.00'), findsOneWidget);
    expect(find.text('75% of this month’s invoices'), findsOneWidget);
    expect(find.text('80%'), findsOneWidget);
    expect(find.text('8 of 10 let · 2 vacant'), findsOneWidget);
    expect(find.text('2 M-Pesa payments need matching'), findsOneWidget);
    expect(find.text('Amina Test'), findsOneWidget);
    for (final a in ['Record payment', 'Read a meter', 'Add expense']) {
      expect(find.text(a), findsOneWidget);
    }
  });

  testWidgets('no figures or actions without the permissions', (tester) async {
    final adapter = FakeAdapter({});
    await _pump(tester, adapter, {'units:view'});
    expect(adapter.sent('GET', '/reports/dashboard'), isEmpty);
    expect(adapter.sent('GET', '/reports/today'), isEmpty);
    expect(find.text('Figures aren’t available for your role'), findsOneWidget);
    expect(find.text('Record payment'), findsNothing);
  });

  testWidgets(
    'caretaker Today view shows unread meters, move-ins, move-outs and repairs without money',
    (tester) async {
      final adapter = FakeAdapter({
        'GET /reports/today': (_) => {
          'data': {
            'asOf': '2026-10-28',
            'period': '2026-10',
            'propertyId': null,
            'unreadMeters': [
              {
                'id': 'm1',
                'serialNo': 'W-A1',
                'unit': {'id': 'u1', 'number': 'A1'},
                'property': {'id': 'p1', 'code': 'JSM', 'name': 'Jasmine'},
                'chargeType': {'id': 'ct1', 'name': 'Water', 'unitLabel': 'm³'},
              },
            ],
            'moveIns': [
              {
                'tenancyId': 'tn1',
                'startDate': '2026-10-28',
                'unit': {'id': 'u1', 'number': 'A1'},
                'property': {'id': 'p1', 'code': 'JSM', 'name': 'Jasmine'},
                'tenant': {
                  ...tenantRefJson('t1'),
                  'firstName': 'Grace',
                  'lastName': 'Mwangi',
                },
              },
            ],
            'moveOuts': [
              {
                'tenancyId': 'tn2',
                'endDate': '2026-10-30',
                'hasMoveOutInspection': false,
                'unit': {'id': 'u2', 'number': 'A2'},
                'property': {'id': 'p1', 'code': 'JSM', 'name': 'Jasmine'},
                'tenant': {
                  ...tenantRefJson('t2'),
                  'firstName': 'Peter',
                  'lastName': 'Otieno',
                },
              },
            ],
            'openRepairs': [
              {
                'id': 'r1',
                'number': 'MNT-2026-000001',
                'title': 'Burst pipe',
                'category': 'PLUMBING',
                'priority': 'URGENT',
                'status': 'OPEN',
                'overdue': true,
                'unit': {'id': 'u1', 'number': 'A1'},
                'property': {'id': 'p1', 'code': 'JSM', 'name': 'Jasmine'},
                'vendor': {
                  'id': 'v1',
                  'name': 'Juma Plumbing',
                  'phone': '+254733100200',
                },
              },
            ],
          },
        },
      });
      await _pump(tester, adapter, {
        'meters:view',
        'meters:create',
        'tenancies:view',
        'maintenance:view',
      });
      expect(adapter.sent('GET', '/reports/dashboard'), isEmpty);
      expect(adapter.sent('GET', '/reports/today'), hasLength(1));
      expect(find.text('Water · W-A1'), findsOneWidget);
      expect(find.text('Grace Mwangi'), findsOneWidget);
      expect(find.text('Peter Otieno'), findsOneWidget);
      expect(find.text('Burst pipe · MNT-2026-000001'), findsOneWidget);
      expect(find.text('Overdue'), findsOneWidget);
      expect(find.textContaining('KES'), findsNothing);
      expect(find.text('Read a meter'), findsOneWidget);
      expect(find.text('Record payment'), findsNothing);
    },
  );

  testWidgets(
    'caretaker Today view shows empty state when nothing is waiting',
    (tester) async {
      final adapter = FakeAdapter({
        'GET /reports/today': (_) => {
          'data': {
            'asOf': '2026-10-28',
            'period': '2026-10',
            'propertyId': null,
            'unreadMeters': [],
            'moveIns': [],
            'moveOuts': [],
            'openRepairs': [],
          },
        },
      });
      await _pump(tester, adapter, {'meters:view', 'maintenance:view'});
      expect(find.text('Nothing waiting today'), findsOneWidget);
    },
  );

  testWidgets(
    'maintenance detail sheet displays vendor completion report and copies vendor link',
    (tester) async {
      final adapter = FakeAdapter({
        'GET /maintenance-requests': (_) => page([
          {
            'id': 'mr1',
            'number': 'MNT-2026-000001',
            'title': 'Leaking kitchen tap',
            'description': 'Water dripping under sink',
            'category': 'PLUMBING',
            'priority': 'HIGH',
            'status': 'IN_PROGRESS',
            'property': {'id': 'p1', 'code': 'JSM', 'name': 'Jasmine'},
            'unit': {'id': 'u1', 'number': 'A1', 'floor': 1},
            'vendor': {
              'id': 'v1',
              'name': 'Juma Plumbing',
              'phone': '+254733100200',
            },
            'hasVendorLink': true,
            'vendorNote': 'Fitted new cartridge and washer',
            // 01:30 on 25 Nov in Nairobi (still the 24th in UTC).
            'vendorCompletedAt': '2026-11-24T22:30:00Z',
            'vendorPhotoUploadIds': ['up1'],
            'photoUploadIds': <String>[],
            'expense': null,
          },
        ]),
        'GET /vendors': (_) => page([
          {
            'id': 'v1',
            'name': 'Juma Plumbing',
            'phone': '+254733100200',
            'trades': ['PLUMBING'],
            'active': true,
          },
        ]),
        'GET /maintenance-requests/mr1/photos/up1': (_) =>
            Reply(404, {'error': 'gone'}),
        'GET /maintenance-requests/mr1/vendor-link': (_) => {
          'data': {'url': 'https://app.kodihq.co.ke/r/tok1234567890abcdef'},
        },
      });
      await pumpScreen(
        tester,
        const StaffMaintenanceScreen(),
        adapter: adapter,
        permissions: {'maintenance:view', 'maintenance:update'},
      );

      expect(
        find.text('Leaking kitchen tap · MNT-2026-000001'),
        findsOneWidget,
      );
      await tester.tap(find.text('Leaking kitchen tap · MNT-2026-000001'));
      await tester.pumpAndSettle();

      expect(find.text('Vendor report'), findsOneWidget);
      expect(find.text('Fitted new cartridge and washer'), findsOneWidget);
      expect(find.text('Completed 25 Nov 2026'), findsOneWidget);
      // The photo itself is fetched with the session (here it fails, so a placeholder shows).
      expect(
        adapter.sent('GET', '/maintenance-requests/mr1/photos/up1'),
        hasLength(1),
      );
      expect(find.byIcon(Icons.broken_image_outlined), findsOneWidget);
      expect(find.byKey(const Key('copy-vendor-link')), findsOneWidget);
      expect(find.byKey(const Key('rotate-vendor-link')), findsOneWidget);

      await tester.ensureVisible(find.byKey(const Key('copy-vendor-link')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('copy-vendor-link')));
      await tester.pumpAndSettle();
      expect(
        adapter.sent('GET', '/maintenance-requests/mr1/vendor-link'),
        hasLength(1),
      );
    },
  );
}
