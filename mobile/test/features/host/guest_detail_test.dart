import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hodi/core/navigation.dart';
import 'package:hodi/features/host/host_routes.dart';
import 'package:hodi/features/host/guest_detail_screen.dart';

import '../../staff/helpers.dart';

Map<String, Object?> _guest({bool money = true}) => {
  'data': {
    'id': 'g1',
    'name': 'Kelvin Mbugua',
    'phone': '+254700000000',
    'email': 'guest@example.invalid',
    'notes': 'Prefers late check-in',
    'doNotAccept': false,
    'idNumberHint': '****5678',
    if (money) 'totalPaid': '2600000',
    'staysCount': 2,
    'lastStay': '2026-11-14',
    'stays': [
      {
        'id': 'b8',
        'code': 'B00008',
        'status': 'COMPLETED',
        'checkIn': '2026-11-14',
        'checkOut': '2026-11-19',
        'guests': 2,
        if (money) 'amountPaid': '2600000',
        'listing': {'id': 'l1', 'title': 'Spacious 1BR Executive'},
        'unit': {'id': 'u1', 'number': '102'},
        'property': {'id': 'p1', 'code': 'MC', 'name': 'Makini Court'},
      },
      {
        'id': 'b2',
        'code': 'B00002',
        'status': 'COMPLETED',
        'checkIn': '2026-10-03',
        'checkOut': '2026-10-06',
        'guests': 1,
        if (money) 'amountPaid': '0',
        'listing': {'id': 'l1', 'title': 'Spacious 1BR Executive'},
        'unit': {'id': 'u1', 'number': '102'},
        'property': {'id': 'p1', 'code': 'MC', 'name': 'Makini Court'},
      },
    ],
  },
};

void main() {
  testWidgets('a guest page shows contact, stays and notes, and saves edits', (
    tester,
  ) async {
    final adapter = FakeAdapter({
      'GET /host/guests/g1': (_) => _guest(),
      'PATCH /host/guests/g1': (_) => _guest(),
    });
    await pumpScreen(
      tester,
      const GuestDetailScreen(guestId: 'g1'),
      adapter: adapter,
      permissions: const {'guests:view', 'guests:update', 'stay-payments:view'},
      orgKind: 'HOST',
    );

    expect(find.text('2 stays'), findsOneWidget);
    expect(find.text('WhatsApp'), findsOneWidget);
    expect(find.text('KES 26,000.00'), findsOneWidget);
    expect(find.text('Message guest'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Review before booking'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Sat 14 Nov → Thu 19 Nov'), findsOneWidget);
    expect(find.text('ID / passport: ****5678'), findsOneWidget);

    await tester.ensureVisible(find.byType(Switch));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save changes'));
    await tester.pumpAndSettle();

    final sent = adapter.sent('PATCH', '/host/guests/g1').single;
    final body = sent.data is String
        ? jsonDecode(sent.data as String)
        : sent.data;
    expect(body, {'notes': 'Prefers late check-in', 'doNotAccept': true});
    expect(find.text('Guest saved.'), findsOneWidget);
  });

  testWidgets('without guests:update the page is read-only', (tester) async {
    // The server leaves money out for staff who can't see it.
    final adapter = FakeAdapter({
      'GET /host/guests/g1': (_) => _guest(money: false),
    });
    await pumpScreen(
      tester,
      const GuestDetailScreen(guestId: 'g1'),
      adapter: adapter,
      permissions: const {'guests:view'},
      orgKind: 'HOST',
    );
    expect(find.text('Save changes'), findsNothing);
    expect(find.textContaining('KES'), findsNothing);
    await tester.scrollUntilVisible(
      find.text('Prefers late check-in'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('tapping the guest on a booking opens their page', (
    tester,
  ) async {
    phoneSize(tester);
    final adapter = FakeAdapter({
      'GET /host/bookings/b8': (_) => {
        'data': {
          'id': 'b8',
          'code': 'B00008',
          'status': 'COMPLETED',
          'source': 'SITE',
          'checkIn': '2026-11-14',
          'checkOut': '2026-11-19',
          'guests': 2,
          'listing': {'id': 'l1', 'title': 'Spacious 1BR Executive'},
          'unit': {'id': 'u1', 'number': '102'},
          'property': {'id': 'p1', 'code': 'MC', 'name': 'Makini Court'},
          'guest': {
            'id': 'g1',
            'name': 'Kelvin Mbugua',
            'phone': '+254700000000',
            'email': null,
          },
          'createdAt': '2026-11-12T15:40:00.000Z',
        },
      },
      'GET /host/guests/g1': (_) => _guest(),
    });
    final router = GoRouter(
      navigatorKey: rootNavigatorKey,
      initialLocation: '/host/bookings/b8',
      routes: hostRoutes(),
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: overridesFor(adapter, const {
          'bookings:view',
          'guests:view',
          'guests:update',
        }, orgKind: 'HOST'),
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Kelvin Mbugua'));
    await tester.tap(find.text('Kelvin Mbugua'));
    await tester.pumpAndSettle();

    // The guest page is on top (a push keeps the booking underneath).
    expect(find.byType(GuestDetailScreen), findsOneWidget);
    expect(find.text('2 stays'), findsOneWidget);
    expect(find.text('Save changes'), findsOneWidget);
  });
}
