import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/auth/session.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/features/host/today_screen.dart';

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

void main() {
  group('in-house', () {
    const today = '2026-11-09';
    test('lists checked-in guests', () {
      expect(
        isInHouse('CHECKED_IN', '2026-11-08', '2026-11-11', today),
        isTrue,
      );
    });
    test('does not list today\'s arrivals who have not checked in', () {
      expect(isInHouse('CONFIRMED', today, '2026-11-11', today), isFalse);
    });
    test(
      'lists a confirmed stay that began earlier but was never checked in',
      () {
        expect(
          isInHouse('CONFIRMED', '2026-11-07', '2026-11-11', today),
          isTrue,
        );
        expect(isInHouse('CONFIRMED', '2026-11-07', today, today), isFalse);
      },
    );
  });

  testWidgets(
    'today screen renders arrivals, requests and hides money for caretaker without stay-payments:view',
    (tester) async {
      phoneSize(tester);
      final today = DateTime.now().toIso8601String().substring(0, 10);
      final tomorrow = DateTime.now()
          .add(const Duration(days: 2))
          .toIso8601String()
          .substring(0, 10);

      final adapter = FakeAdapter({
        'GET /host/bookings': (_) => page([
          {
            'id': 'b1',
            'code': 'BK26120001',
            'status': 'CONFIRMED',
            'source': 'SITE',
            'checkIn': today,
            'checkOut': tomorrow,
            'nights': 2,
            'guests': 2,
            'cleaningDone': false,
            'listing': {'id': 'l1', 'title': 'Sea Breeze Studio'},
            'unit': {'id': 'u1', 'number': 'A1'},
            'property': {'id': 'p1', 'code': 'P001', 'name': 'Ocean View'},
            'guest': {
              'id': 'g1',
              'name': 'Jane Guest',
              'phone': '+254711222333',
            },
          },
          {
            'id': 'b2',
            'code': 'BK26120002',
            'status': 'REQUESTED',
            'source': 'SITE',
            'checkIn': tomorrow,
            'checkOut': tomorrow,
            'nights': 1,
            'guests': 1,
            'cleaningDone': true,
            'listing': {'id': 'l1', 'title': 'Sea Breeze Studio'},
            'unit': {'id': 'u1', 'number': 'A1'},
            'property': {'id': 'p1', 'code': 'P001', 'name': 'Ocean View'},
            'guest': {
              'id': 'g2',
              'name': 'Peter Caller',
              'phone': '+254722333444',
            },
          },
        ]),
        'GET /host/listings': (_) => page([
          {
            'id': 'l1',
            'unit': {'id': 'u1', 'number': 'A1'},
            'property': {'id': 'p1', 'code': 'P001', 'name': 'Ocean View'},
            'title': 'Sea Breeze Studio',
            'bedrooms': 1,
            'bathrooms': 1,
            'beds': 1,
            'maxGuests': 2,
            'amenities': <String>[],
            'nightlyPrice': '200000',
            'cleaningFee': '0',
            'securityDeposit': '0',
            'weeklyDiscountBps': 0,
            'monthlyDiscountBps': 0,
            'minNights': 1,
            'maxNights': 30,
            'published': true,
            'photos': <Object?>[],
            'specialPrices': <Object?>[],
          },
        ]),
      });

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            apiClientProvider.overrideWithValue(fakeApi(adapter)),
            sessionProvider.overrideWith(
              () => FakeSession(
                _session(permissions: const {'bookings:view', 'listings:view'}),
              ),
            ),
          ],
          child: const MaterialApp(home: TodayScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('Jane Guest'), findsWidgets);
      expect(find.textContaining('Peter Caller'), findsWidgets);
      expect(find.textContaining('KES'), findsNothing);
    },
  );
}
