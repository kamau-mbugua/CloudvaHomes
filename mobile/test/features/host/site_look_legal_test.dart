import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/host/host_models.dart';

void main() {
  const legal = {
    'terms': {
      'text': 'Our terms',
      'isDefault': false,
      'starter': 'Starter terms',
    },
    'termsOfUse': {
      'text': 'Starter use',
      'isDefault': true,
      'starter': 'Starter use',
    },
    'privacy': {
      'text': 'Starter privacy',
      'isDefault': true,
      'starter': 'Starter privacy',
    },
  };

  test('reads the booking site look and legal pages', () {
    final site = HostSite.fromJson({
      'published': true,
      'theme': {'preset': 'ocean', 'brandColor': '#1F4D3A'},
      'legal': legal,
    });
    expect(site.themePreset, 'ocean');
    expect(site.brandColor, '#1F4D3A');
    expect(site.legal['terms']!.text, 'Our terms');
    expect(site.legal['terms']!.isDefault, isFalse);
    expect(site.legal['privacy']!.starter, 'Starter privacy');
  });

  test('older answers without a look or legal pages still read', () {
    final site = HostSite.fromJson({'published': false});
    expect(site.themePreset, 'forest');
    expect(site.brandColor, isNull);
    expect(site.legal, isEmpty);
  });

  test('offers the same six themes as the web', () {
    expect(siteThemePresets.map((p) => p.key), [
      'forest',
      'ocean',
      'sunset',
      'terracotta',
      'plum',
      'charcoal',
    ]);
  });

  test('accepts only #RRGGBB brand colours', () {
    expect(isHexColor('#1F4D3A'), isTrue);
    expect(isHexColor('1F4D3A'), isFalse);
    expect(isHexColor('#1F4D3'), isFalse);
  });

  test('sends nothing for a legal page left on the starter text', () {
    expect(legalPayload('Starter terms', 'Starter terms'), isNull);
    expect(legalPayload('  ', 'Starter terms'), isNull);
    expect(legalPayload(' Our terms ', 'Starter terms'), 'Our terms');
  });
}
