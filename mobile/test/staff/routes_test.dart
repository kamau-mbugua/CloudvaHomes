import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hodi/core/navigation.dart';
import 'package:hodi/features/staff/staff_api.dart';
import 'package:hodi/features/staff/staff_routes.dart';

import 'helpers.dart';

void main() {
  test('webOrigin strips /api/v1', () {
    expect(
      webOrigin('https://app.example.invalid/api/v1'),
      'https://app.example.invalid',
    );
    expect(
      webOrigin('https://app.example.invalid/api/v1/'),
      'https://app.example.invalid',
    );
    expect(webOrigin('http://10.0.2.2:8080'), 'http://10.0.2.2:8080');
  });

  test('the month is Nairobi’s', () {
    // 22:30 UTC on 31 Oct is already 1 Nov in Nairobi.
    expect(nairobiPeriod(DateTime.utc(2026, 10, 31, 22, 30)), '2026-11');
    expect(
      nairobiToday(DateTime.utc(2026, 10, 31, 22, 30)),
      DateTime(2026, 11, 1),
    );
  });

  testWidgets('tabs, details over the shell, and Plan & billing from any tab', (
    tester,
  ) async {
    phoneSize(tester);
    final adapter = FakeAdapter({
      'GET /units': (_) => page([]),
      'GET /tenants': (_) => page([tenantJson()]),
      'GET /tenants/t1': (_) => {'data': tenantJson()},
      'GET /tenants/t1/open-invoices': (_) => {'data': []},
      'GET /tenants/t1/statement': (_) => {
        'data': {
          'from': '2026-01-01',
          'to': '2026-10-28',
          'openingBalance': 0,
          'closingBalance': 1500000,
          'creditBalance': 0,
          'depositHeld': 3000000,
          'entries': [],
        },
      },
      'GET /payments': (_) => page([]),
      'GET /billing': (_) => {
        'data': {
          'status': 'ACTIVE',
          'balance': 0,
          'credit': 0,
          'plan': {'name': 'Standard'},
          'price': {'pricePerUnit': 10000, 'minimumMonthly': 0},
        },
      },
      'GET /billing/invoices': (_) => page([]),
    });
    final router = GoRouter(
      navigatorKey: rootNavigatorKey,
      initialLocation: '/staff/units',
      routes: [staffRoutes()],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: overridesFor(adapter, {
          'units:view',
          'tenants:view',
          'payments:view',
          'settings:view',
        }),
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    for (final label in ['Home', 'Units', 'Tenants', 'Money', 'More']) {
      expect(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text(label),
        ),
        findsOneWidget,
      );
    }

    // The tenant tab, then a tenant: the detail covers the shell.
    await tester.tap(find.text('Tenants').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Amina Test'));
    await tester.pumpAndSettle();
    expect(find.text('Deposit held'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.byType(AppBar), findsOneWidget);

    router.pop();
    await tester.pumpAndSettle();
    expect(find.byType(NavigationBar), findsOneWidget);

    // The bill banner pushes /staff/billing from whatever tab is open.
    router.push('/staff/billing');
    await tester.pumpAndSettle();
    expect(find.text('Plan & billing'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
  });
}
