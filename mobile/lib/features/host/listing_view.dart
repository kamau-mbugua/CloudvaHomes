import 'host_models.dart';

/// Wording for the listings screens (KodiHQ "Listings · mobile" and "Edit listing · mobile").

/// "1,000" for whole shillings held in minor units as a string ("100000").
String shillingsOf(String minor) {
  final cents = int.tryParse(minor) ?? 0;
  final whole = (cents ~/ 100).toString();
  return whole.replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
}

String _plural(int n, String one, [String? many]) =>
    '$n ${n == 1 ? one : (many ?? '${one}s')}';

/// "2 bedrooms · 2 bathrooms · up to 4 guests" (a studio has no bedrooms).
String listingSpecs(HostListing l) => [
  l.bedrooms == 0 ? 'Studio' : _plural(l.bedrooms, 'bedroom'),
  _plural(l.bathrooms, 'bathroom'),
  'up to ${_plural(l.maxGuests, 'guest')}',
].join(' · ');

/// "a night · 8,000 Fri and Sat" when weekends cost differently, else "a night".
String priceTail(HostListing l) {
  final w = l.weekendPrice;
  if (w == null || w == l.nightlyPrice) return 'a night';
  return 'a night · ${shillingsOf(w)} Fri and Sat';
}

/// The listing's page on the host's booking site, or null without a web address.
String? publicListingUrl(String? siteAddress, String listingId) {
  if (siteAddress == null || siteAddress.isEmpty) return null;
  final base = siteAddress.endsWith('/')
      ? siteAddress.substring(0, siteAddress.length - 1)
      : siteAddress;
  return '$base/u/$listingId';
}

/// "makini.kodihq.co.ke/u/…" without the scheme, for showing.
String shortUrl(String url) => url.replaceFirst(RegExp(r'^https?://'), '');

enum ListingFilter { all, freeTonight, hidden, noPhotos }

bool matchesFilter(
  HostListing l,
  ListingFilter f, {
  required bool freeTonight,
}) => switch (f) {
  ListingFilter.all => true,
  ListingFilter.freeTonight => freeTonight,
  ListingFilter.hidden => !l.published,
  ListingFilter.noPhotos => l.photos.isEmpty,
};

bool matchesSearch(HostListing l, String q) {
  final needle = q.trim().toLowerCase();
  if (needle.isEmpty) return true;
  return '${l.title} ${l.unitNumber} ${l.propertyName} ${l.area ?? ''}'
      .toLowerCase()
      .contains(needle);
}

/// The worked example under the prices: a Friday-to-Monday stay (Fri and Sat at the weekend
/// rate, Sun at the weeknight rate) plus cleaning. Null until a weeknight price is entered.
String? priceExample({
  required int? nightly,
  required int? weekend,
  required int cleaning,
}) {
  if (nightly == null || nightly <= 0) return null;
  final w = weekend ?? nightly;
  final total = 2 * w + nightly + cleaning;
  String k(int v) => v.toString().replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => ',',
  );
  final nights = w == nightly
      ? '3 × ${k(nightly)}'
      : '2 × ${k(w)} + ${k(nightly)}';
  final clean = cleaning > 0 ? ' + ${k(cleaning)} cleaning' : '';
  return 'A guest staying Fri to Mon (3 nights) pays KES ${k(total)}: $nights$clean.';
}

/// Check-in / check-out time choices: every half hour from 06:00 to 23:30.
final stayTimeChoices = [
  for (var h = 6; h < 24; h++)
    for (final m in const ['00', '30']) '${h.toString().padLeft(2, '0')}:$m',
];
