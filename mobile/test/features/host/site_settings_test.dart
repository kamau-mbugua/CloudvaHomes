import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/host/site_settings_screen.dart';

import '../../staff/helpers.dart';

Map<String, Object?> siteJson() => {
  'slug': 'makini',
  'published': true,
  'businessName': 'Makini Homes',
  'about': null,
  'contactPhone': '+254712000001',
  'whatsappPhone': null,
  'rules': {
    'bookingMode': 'INSTANT',
    'payWhen': 'FULL_UPFRONT',
    'cancellation': 'MODERATE',
  },
  'houseRules': null,
  'checkInTime': '14:00',
  'checkOutTime': '10:00',
  'address': 'https://makini.dev.kodihub.co.ke',
  'theme': {'preset': 'forest', 'brandColor': null},
  'legal': {
    'terms': {
      'text': 'Starter terms',
      'isDefault': true,
      'starter': 'Starter terms',
    },
    'termsOfUse': {
      'text': 'Starter use',
      'isDefault': true,
      'starter': 'Starter use',
    },
    'privacy': {
      'text': 'Our privacy',
      'isDefault': false,
      'starter': 'Starter privacy',
    },
  },
};

void main() {
  testWidgets('hosts pick a theme, edit a legal page and save both', (
    tester,
  ) async {
    final adapter = FakeAdapter({
      'GET /host/site': (_) => {'data': siteJson()},
      'PATCH /host/site': (_) => {'data': siteJson()},
    });
    await pumpScreen(
      tester,
      const SiteSettingsScreen(),
      adapter: adapter,
      permissions: {'site:view', 'site:update'},
      orgKind: 'HOST',
    );
    final list = find.byType(Scrollable).first;

    await tester.scrollUntilVisible(find.text('Ocean'), 200, scrollable: list);
    await tester.tap(find.text('Ocean'));
    await tester.pump();

    await tester.scrollUntilVisible(
      find.text('Terms and Conditions'),
      200,
      scrollable: list,
    );
    expect(find.text('Starter text'), findsWidgets);
    expect(find.text('Your text'), findsOneWidget); // privacy
    await tester.tap(find.text('Terms and Conditions'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('legal-text')),
      '## Our terms\nPay on time.',
    );
    await tester.tap(find.byKey(const Key('legal-done')));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('site-save')),
      200,
      scrollable: list,
    );
    await tester.tap(find.byKey(const Key('site-save')));
    await tester.pumpAndSettle();

    final body = adapter.sent('PATCH', '/host/site').single.data as Map;
    expect(body['themePreset'], 'ocean');
    expect(body['brandColor'], isNull);
    expect(body['termsText'], '## Our terms\nPay on time.');
    expect(body['termsOfUseText'], isNull);
    expect(body['privacyText'], 'Our privacy');
  });

  testWidgets('a brand colour must look like #1F4D3A', (tester) async {
    final adapter = FakeAdapter({
      'GET /host/site': (_) => {'data': siteJson()},
      'PATCH /host/site': (_) => {'data': siteJson()},
    });
    await pumpScreen(
      tester,
      const SiteSettingsScreen(),
      adapter: adapter,
      permissions: {'site:view', 'site:update'},
      orgKind: 'HOST',
    );
    final list = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(
      find.byKey(const Key('site-brand')),
      200,
      scrollable: list,
    );
    await tester.enterText(find.byKey(const Key('site-brand')), 'green');
    await tester.scrollUntilVisible(
      find.byKey(const Key('site-save')),
      200,
      scrollable: list,
    );
    await tester.tap(find.byKey(const Key('site-save')));
    await tester.pumpAndSettle();
    expect(adapter.sent('PATCH', '/host/site'), isEmpty);
    expect(find.textContaining('Use a colour like #1F4D3A'), findsWidgets);
  });

  testWidgets('copies the booking link', (tester) async {
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData') {
          copied = (call.arguments as Map)['text'] as String?;
        }
        return null;
      },
    );
    final adapter = FakeAdapter({
      'GET /host/site': (_) => {'data': siteJson()},
    });
    await pumpScreen(
      tester,
      const SiteSettingsScreen(),
      adapter: adapter,
      permissions: {'site:view'},
      orgKind: 'HOST',
    );
    await tester.tap(find.byKey(const Key('site-copy-link')));
    await tester.pumpAndSettle();
    expect(copied, 'https://makini.dev.kodihub.co.ke');
  });
}
