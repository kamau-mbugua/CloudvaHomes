import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/auth/session.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/features/host/booking_detail_screen.dart';
import 'package:hodi/features/host/bookings_screen.dart';

import '../../staff/helpers.dart';

Session _session({required Set<String> permissions}) => Session(
  accessToken: 'token',
  user: SessionUser(
    id: 'u1',
    firstName: 'Wanjiku',
    lastName: 'Host',
    email: 'host@example.invalid',
    phone: '+254700000001',
  ),
  organizations: [
    OrgMembership(
      id: 'o1',
      name: 'Cozy Stays',
      roleName: 'Owner',
      kind: 'HOST',
    ),
  ],
  activeOrganization: ActiveOrg(
    id: 'o1',
    name: 'Cozy Stays',
    kind: 'HOST',
    status: 'ACTIVE',
  ),
  properties: [SessionProperty(id: 'p1', code: 'P001', name: 'Ocean View')],
  permissions: permissions,
  tenantOf: const [],
  ownerOf: const [],
);

Map<String, Object?> _bookingJson({
  required String status,
  required bool includeMoney,
}) => {
  'id': 'b1',
  'code': 'BK26120001',
  'status': status,
  'source': 'SITE',
  'checkIn': '2026-12-01',
  'checkOut': '2026-12-04',
  'nights': 3,
  'guests': 2,
  'cleaningDone': false,
  'listing': {'id': 'l1', 'title': 'Sea Breeze Studio'},
  'unit': {'id': 'u1', 'number': 'A1'},
  'property': {'id': 'p1', 'code': 'P001', 'name': 'Ocean View'},
  'guest': {
    'id': 'g1',
    'name': 'Jane Guest',
    'phone': '+254711222333',
    'email': 'jane@example.invalid',
  },
  if (includeMoney) ...{
    'lines': [
      {
        'id': 'ln1',
        'kind': 'NIGHT',
        'date': '2026-12-01',
        'label': 'Nightly rate',
        'amount': '200000',
      },
    ],
    'subtotal': '600000',
    'discount': '0',
    'cleaningFee': '50000',
    'securityDeposit': '0',
    'total': '650000',
    'dueNow': '650000',
    'amountPaid': '0',
    'amountRefunded': '0',
    'owed': '650000',
    'payments': <Object?>[],
  },
};

void main() {
  testWidgets(
    'booking detail for REQUESTED shows Accept and Decline and has no overflow at 1.3x text scale',
    (tester) async {
      phoneSize(tester);
      final adapter = FakeAdapter({
        'GET /host/bookings/b1': (_) => {
          'data': _bookingJson(status: 'REQUESTED', includeMoney: true),
        },
      });

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            apiClientProvider.overrideWithValue(fakeApi(adapter)),
            sessionProvider.overrideWith(
              () => FakeSession(
                _session(
                  permissions: const {
                    'bookings:view',
                    'bookings:update',
                    'bookings:cancel',
                    'stay-payments:view',
                    'stay-payments:create',
                  },
                ),
              ),
            ),
          ],
          child: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(1.3)),
            child: const MaterialApp(
              home: BookingDetailScreen(bookingId: 'b1'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Accept'), findsOneWidget);
      expect(find.text('Decline'), findsOneWidget);
      expect(find.textContaining('KES 6,500'), findsWidgets);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('caretaker booking detail shows no money rows (never KES 0)', (
    tester,
  ) async {
    phoneSize(tester);
    final adapter = FakeAdapter({
      'GET /host/bookings/b1': (_) => {
        'data': _bookingJson(status: 'CONFIRMED', includeMoney: false),
      },
    });

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(fakeApi(adapter)),
          sessionProvider.overrideWith(
            () => FakeSession(
              _session(permissions: const {'bookings:view', 'bookings:update'}),
            ),
          ),
        ],
        child: const MaterialApp(home: BookingDetailScreen(bookingId: 'b1')),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('Jane Guest'), findsOneWidget);
    expect(find.text('Check in'), findsOneWidget);
    expect(find.textContaining('KES'), findsNothing);
    expect(find.text('Price breakdown'), findsNothing);
  });

  testWidgets('bookings list uses PagedList and loads page 2', (tester) async {
    phoneSize(tester);
    final requestedPages = <String>[];
    final adapter = FakeAdapter({
      'GET /host/bookings': (req) {
        final p = req.uri.queryParameters['page'] ?? '1';
        requestedPages.add(p);
        if (p == '1') {
          return page(
            [
              {
                ..._bookingJson(status: 'CONFIRMED', includeMoney: true),
                'id': 'b1',
                'code': 'BK26120001',
                'guest': {
                  'id': 'g1',
                  'name': 'Jane PageOne',
                  'phone': '+254711222333',
                },
              },
            ],
            page: 1,
            pages: 2,
          );
        }
        return page(
          [
            {
              ..._bookingJson(status: 'CONFIRMED', includeMoney: true),
              'id': 'b2',
              'code': 'BK26120002',
              'guest': {
                'id': 'g2',
                'name': 'Peter PageTwo',
                'phone': '+254722333444',
              },
            },
          ],
          page: 2,
          pages: 2,
        );
      },
      'GET /billing': (_) => {
        'data': {
          'status': 'ACTIVE',
          'balance': 0,
          'credit': 0,
          'plan': {'name': 'Standard'},
          'price': {'pricePerUnit': 10000, 'minimumMonthly': 0},
        },
      },
    });

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(fakeApi(adapter)),
          sessionProvider.overrideWith(
            () => FakeSession(
              _session(
                permissions: const {'bookings:view', 'stay-payments:view'},
              ),
            ),
          ),
        ],
        child: const MaterialApp(home: BookingsScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(requestedPages, ['1', '2']);
    expect(find.textContaining('Jane PageOne'), findsOneWidget);
    expect(find.textContaining('Peter PageTwo'), findsOneWidget);
    expect(find.textContaining('KES 6,500.00'), findsWidgets);
  });
}
