import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/auth/session.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/features/host/listing_editor_screen.dart';
import 'package:hodi/features/host/listings_screen.dart';

import '../../staff/helpers.dart';

Session _hostOwnerSession() => Session(
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
  permissions: const {
    'listings:view',
    'listings:create',
    'listings:update',
    'listings:delete',
    'properties:view',
  },
  tenantOf: const [],
  ownerOf: const [],
);

Map<String, Object?> _listingJson() => {
  'id': 'l1',
  'unit': {'id': 'u1', 'number': 'A1'},
  'property': {
    'id': 'p1',
    'code': 'P001',
    'name': 'Ocean View',
    'location': 'Nyali',
  },
  'title': 'Sea Breeze Studio',
  'description': 'Bright beachfront studio',
  'bedrooms': 1,
  'bathrooms': 1,
  'beds': 1,
  'maxGuests': 2,
  'amenities': ['Wi-Fi', 'Kitchen'],
  'area': 'Nyali',
  'checkInInstructions': 'Collect keys at the gate',
  'nightlyPrice': '200000',
  'weekendPrice': null,
  'cleaningFee': '0',
  'securityDeposit': '0',
  'weeklyDiscountBps': 0,
  'monthlyDiscountBps': 0,
  'minNights': 1,
  'maxNights': 30,
  'published': true,
  'rulesOverride': null,
  'coverUploadId': null,
  'photos': <Object?>[],
  'specialPrices': <Object?>[],
  'createdAt': '2026-11-06T10:00:00.000Z',
  'updatedAt': '2026-11-06T10:00:00.000Z',
};

void main() {
  testWidgets(
    'listings screen shows title, nightly price KES 2,000 and Published from FakeAdapter',
    (tester) async {
      phoneSize(tester);
      final adapter = FakeAdapter({
        'GET /host/listings': (_) => page([_listingJson()]),
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
              () => FakeSession(_hostOwnerSession()),
            ),
          ],
          child: const MaterialApp(home: ListingsScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Sea Breeze Studio'), findsOneWidget);
      expect(find.textContaining('KES 2,000'), findsOneWidget);
      expect(find.text('Published'), findsOneWidget);
    },
  );

  testWidgets('listing editor rejects 2000.50 with Use whole shillings', (
    tester,
  ) async {
    phoneSize(tester);
    final adapter = FakeAdapter({
      'GET /properties': (_) => page([
        {'id': 'p1', 'code': 'P001', 'name': 'Ocean View'},
      ]),
    });

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(fakeApi(adapter)),
          sessionProvider.overrideWith(() => FakeSession(_hostOwnerSession())),
        ],
        child: const MaterialApp(home: ListingEditorScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('listing-unit-number')), 'A2');
    await tester.enterText(find.byKey(const Key('listing-title')), 'Palm Loft');
    await tester.enterText(
      find.byKey(const Key('listing-nightly-price')),
      '2000.50',
    );

    final saveBtn = find.byKey(const Key('listing-save'));
    await tester.ensureVisible(saveBtn);
    await tester.tap(saveBtn);
    await tester.pumpAndSettle();

    expect(find.text('Use whole shillings'), findsOneWidget);
    expect(adapter.sent('POST', '/host/listings'), isEmpty);
  });
}
