import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/theme.dart';
import 'package:hodi/features/staff/home/home_screen.dart';

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
    expect(find.text('Figures aren’t available for your role'), findsOneWidget);
    expect(find.text('Record payment'), findsNothing);
  });
}
