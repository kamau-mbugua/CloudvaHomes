import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/host/listing_editor_screen.dart';
import 'package:hodi/features/host/listings_screen.dart';

import '../../staff/helpers.dart';

final _today = DateTime.now().toIso8601String().substring(0, 10);

Map<String, Object?> _listing(
  String id,
  String unit,
  String title, {
  String property = 'Kileleshwa Suites',
  bool published = true,
  int photos = 2,
}) => {
  'id': id,
  'unitId': 'u-$id',
  'unit': {'id': 'u-$id', 'number': unit},
  'property': {'id': property, 'code': 'P', 'name': property},
  'title': title,
  'bedrooms': 1,
  'bathrooms': 1,
  'maxGuests': 2,
  'amenities': ['Wi-Fi'],
  'nightlyPrice': '500000',
  'weekendPrice': '550000',
  'cleaningFee': '50000',
  'minNights': 1,
  'maxNights': null,
  'checkInFrom': '14:00',
  'checkOutBy': null,
  'published': published,
  'photos': [
    for (var i = 0; i < photos; i++)
      {'id': '$id-ph$i', 'uploadId': '$id-up$i', 'position': i},
  ],
  'specialPrices': <Object?>[],
};

final _listings = [
  _listing('l1', '401', 'Quiet 1BR retreat'),
  _listing('l2', '402', 'Serene 1BR Garden'),
  _listing('l3', '501', 'Family 2BR Sanctuary'),
  _listing('l4', '502', 'Penthouse 2BR', published: false, photos: 0),
  _listing('l5', '101', 'Cozy 1BR Westlands Hub', property: 'Westlands'),
];

Map<String, Object?> _calendar() => {
  'data': {
    'units': <Object?>[
      for (final l in _listings)
        {
          'unitId': (l['unit'] as Map)['id'],
          'listingId': l['id'],
          'unitNumber': (l['unit'] as Map)['number'],
          'title': l['title'],
          'property': l['property'],
        },
    ],
    'items': [
      {
        'id': 'b1',
        'unitId': 'u-l1',
        'kind': 'STAY',
        'status': 'CHECKED_IN',
        'checkIn': _today,
        'checkOut': DateTime.now()
            .add(const Duration(days: 3))
            .toIso8601String()
            .substring(0, 10),
        'guestName': 'Faith M',
      },
    ],
  },
};

const _owner = {
  'listings:view',
  'listings:create',
  'listings:update',
  'bookings:view',
};

/// The page's own vertical list (text fields and the chip row have scrollables too).
Finder _mainList() => find
    .descendant(of: find.byType(ListView), matching: find.byType(Scrollable))
    .first;

void main() {
  testWidgets('listings: cards, filters, search, compact view and show all', (
    tester,
  ) async {
    final adapter = FakeAdapter({
      'GET /host/listings': (_) => page(_listings),
      'GET /host/bookings/calendar': (_) => _calendar(),
      'GET /host/site': (_) => {
        'data': {'address': 'https://makini.kodihq.co.ke', 'published': true},
      },
      'PATCH /host/listings/l1': (_) => {
        'data': _listing('l1', '401', 'Quiet 1BR retreat', published: false),
      },
    });
    await pumpScreen(
      tester,
      const ListingsScreen(),
      adapter: adapter,
      permissions: _owner,
      orgKind: 'HOST',
    );

    expect(find.text('5 listings'), findsOneWidget);
    expect(find.text('KILELESHWA SUITES'), findsOneWidget);
    // Three per property until "Show all".
    expect(find.text('Quiet 1BR retreat'), findsOneWidget);
    expect(find.text('Booked tonight'), findsOneWidget);
    expect(find.text('2 photos'), findsWidgets);
    expect(find.text('Hidden 1'), findsOneWidget);
    expect(find.text('No photos 1'), findsOneWidget);
    expect(find.text('Free tonight 4'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Show all 4 in Kileleshwa Suites'),
      300,
      scrollable: _mainList(),
    );
    await tester.tap(find.text('Show all 4 in Kileleshwa Suites'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Penthouse 2BR'),
      300,
      scrollable: _mainList(),
    );
    expect(find.text('No photos yet'), findsOneWidget);

    // Filter: hidden only.
    await tester.drag(_mainList(), const Offset(0, 3000));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Hidden 1'));
    await tester.tap(find.text('Hidden 1'));
    await tester.pumpAndSettle();
    expect(find.text('Penthouse 2BR'), findsOneWidget);
    expect(find.text('Quiet 1BR retreat'), findsNothing);

    // Search narrows across properties.
    await tester.ensureVisible(find.text('All 5'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('All 5'));
    await tester.enterText(find.byType(TextField), 'westlands');
    await tester.pumpAndSettle();
    expect(find.text('Cozy 1BR Westlands Hub'), findsOneWidget);
    expect(find.text('Quiet 1BR retreat'), findsNothing);

    // Compact rows.
    await tester.enterText(find.byType(TextField), '');
    await tester.tap(find.bySemanticsLabel('Compact list'));
    await tester.pumpAndSettle();
    expect(find.text('401 · KES 5,000 a night'), findsOneWidget);
    expect(find.text('Edit'), findsNothing);
  });

  testWidgets('listings: ⋮ hides a listing from the site', (tester) async {
    final adapter = FakeAdapter({
      'GET /host/listings': (_) => page([_listings.first]),
      'GET /host/bookings/calendar': (_) => _calendar(),
      'GET /host/site': (_) => {
        'data': {'address': 'https://makini.kodihq.co.ke'},
      },
      'PATCH /host/listings/l1': (_) => {
        'data': _listing('l1', '401', 'Quiet 1BR retreat', published: false),
      },
    });
    await pumpScreen(
      tester,
      const ListingsScreen(),
      adapter: adapter,
      permissions: _owner,
      orgKind: 'HOST',
    );

    await tester.scrollUntilVisible(
      find.byTooltip('More for Quiet 1BR retreat'),
      200,
      scrollable: _mainList(),
    );
    await tester.tap(find.byTooltip('More for Quiet 1BR retreat'));
    await tester.pumpAndSettle();
    expect(find.text('makini.kodihq.co.ke/u/l1'), findsOneWidget);
    await tester.tap(find.text('Hide from site'));
    await tester.pumpAndSettle();
    final sent = adapter.sent('PATCH', '/host/listings/l1').single;
    final body = sent.data is String
        ? jsonDecode(sent.data as String)
        : sent.data;
    expect(body, {'published': false});
  });

  testWidgets(
    'editor: unsaved changes, discard, and a save with only fields the API takes',
    (tester) async {
      final adapter = FakeAdapter({
        'GET /host/listings/l1': (_) => {
          'data': _listing('l1', '401', 'Quiet 1BR retreat'),
        },
        'GET /host/site': (_) => {
          'data': {'address': 'https://makini.kodihq.co.ke'},
        },
        'PATCH /host/listings/l1': (_) => {
          'data': _listing('l1', '401', 'Quiet 1BR retreat, renovated'),
        },
      });
      await pumpScreen(
        tester,
        const ListingEditorScreen(listingId: 'l1'),
        adapter: adapter,
        permissions: _owner,
        orgKind: 'HOST',
      );

      expect(find.text('2 of 20'), findsOneWidget);
      expect(find.text('All changes saved'), findsOneWidget);
      expect(find.text('Preview'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('listing-title')), 'Changed');
      await tester.pumpAndSettle();
      expect(find.text('Unsaved changes'), findsOneWidget);
      await tester.tap(find.text('Discard'));
      await tester.pumpAndSettle();
      expect(find.text('Quiet 1BR retreat'), findsWidgets);
      expect(find.text('All changes saved'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('listing-title')),
        'Quiet 1BR retreat, renovated',
      );
      await tester.scrollUntilVisible(
        find.byTooltip('More Guests'),
        200,
        scrollable: _mainList(),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('More Guests'));
      await tester.ensureVisible(find.byTooltip('More Longest stay'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('More Longest stay'));
      await tester.pumpAndSettle();
      expect(find.text('30'), findsOneWidget);

      await tester.tap(find.byKey(const Key('listing-save')));
      await tester.pumpAndSettle();
      final sent = adapter.sent('PATCH', '/host/listings/l1').single;
      final body =
          (sent.data is String ? jsonDecode(sent.data as String) : sent.data)
              as Map;
      expect(body['title'], 'Quiet 1BR retreat, renovated');
      expect(body['maxGuests'], 3);
      expect(body['maxNights'], 30);
      expect(body['checkInFrom'], '14:00');
      expect(body.containsKey('beds'), isFalse);
      expect(body.containsKey('securityDeposit'), isFalse);
      expect(find.text('Listing saved.'), findsOneWidget);
    },
  );
}
