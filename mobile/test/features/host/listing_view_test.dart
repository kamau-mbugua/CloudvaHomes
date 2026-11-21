import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/host/calendar_rules.dart';
import 'package:hodi/features/host/host_models.dart';
import 'package:hodi/features/host/listing_view.dart';

HostListing listing({
  int bedrooms = 2,
  String nightly = '720000',
  String? weekend = '800000',
  bool published = true,
  int photos = 1,
}) => HostListing.fromJson({
  'id': 'l1',
  'unit': {'id': 'u1', 'number': '501'},
  'property': {'id': 'p1', 'code': 'KS', 'name': 'Kileleshwa Suites'},
  'title': 'Family 2BR Sanctuary',
  'area': 'Kileleshwa',
  'bedrooms': bedrooms,
  'bathrooms': 2,
  'maxGuests': 4,
  'amenities': <String>[],
  'nightlyPrice': nightly,
  'weekendPrice': weekend,
  'cleaningFee': '100000',
  'minNights': 1,
  'published': published,
  'photos': [
    for (var i = 0; i < photos; i++)
      {'id': 'ph$i', 'uploadId': 'up$i', 'position': i},
  ],
  'specialPrices': <Object?>[],
});

void main() {
  test('specs, price and link', () {
    final l = listing();
    expect(listingSpecs(l), '2 bedrooms · 2 bathrooms · up to 4 guests');
    expect(listingSpecs(listing(bedrooms: 0)), startsWith('Studio · '));
    expect(shillingsOf(l.nightlyPrice), '7,200');
    expect(priceTail(l), 'a night · 8,000 Fri and Sat');
    expect(priceTail(listing(weekend: null)), 'a night');
    expect(
      publicListingUrl('https://makini.kodihq.co.ke/', 'l1'),
      'https://makini.kodihq.co.ke/u/l1',
    );
    expect(publicListingUrl(null, 'l1'), isNull);
    expect(
      shortUrl('https://makini.kodihq.co.ke/u/l1'),
      'makini.kodihq.co.ke/u/l1',
    );
    expect(l.maxNights, isNull);
  });

  test('filters and search', () {
    final hidden = listing(published: false, photos: 0);
    expect(
      matchesFilter(hidden, ListingFilter.hidden, freeTonight: true),
      isTrue,
    );
    expect(
      matchesFilter(hidden, ListingFilter.noPhotos, freeTonight: true),
      isTrue,
    );
    expect(
      matchesFilter(listing(), ListingFilter.hidden, freeTonight: true),
      isFalse,
    );
    expect(
      matchesFilter(listing(), ListingFilter.freeTonight, freeTonight: false),
      isFalse,
    );
    expect(matchesSearch(listing(), '501'), isTrue);
    expect(matchesSearch(listing(), 'kileleshwa'), isTrue);
    expect(matchesSearch(listing(), 'westlands'), isFalse);
  });

  test('the worked price example', () {
    expect(
      priceExample(nightly: 7200, weekend: 8000, cleaning: 1000),
      'A guest staying Fri to Mon (3 nights) pays KES 24,200: 2 × 8,000 + 7,200 + 1,000 cleaning.',
    );
    expect(
      priceExample(nightly: 5000, weekend: null, cleaning: 0),
      'A guest staying Fri to Mon (3 nights) pays KES 15,000: 3 × 5,000.',
    );
    expect(priceExample(nightly: null, weekend: 8000, cleaning: 0), isNull);
    expect(stayTimeChoices.first, '06:00');
    expect(stayTimeChoices, contains('14:00'));
  });

  test(
    'booked nights in the next 30 days count stays, not requests or blocks',
    () {
      const today = '2026-11-21';
      CalItem item(String kind, String status, String from, String to) =>
          CalItem(
            kind: kind,
            id: '$kind$from',
            unitId: 'u1',
            from: from,
            to: to,
            status: status,
          );
      expect(
        bookedNights(
          [
            item('BOOKING', 'CONFIRMED', today, '2026-11-24'),
            item('BOOKING', 'REQUESTED', '2026-11-25', '2026-11-27'),
            item('BLOCK', 'CONFIRMED', '2026-11-28', '2026-11-30'),
            item(
              'BOOKING',
              'CHECKED_IN',
              '2026-11-15',
              '2026-11-19',
            ), // overdue: tonight
          ],
          today,
          30,
          today,
        ),
        3,
      );
    },
  );
}
