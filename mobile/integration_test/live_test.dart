import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/app.dart';
import 'package:hodi/core/auth/token_store.dart';
import 'package:image_picker_platform_interface/image_picker_platform_interface.dart';
import 'package:integration_test/integration_test.dart';

import 'fake_picker.dart';
import 'live_helpers.dart';

/// Tenant then staff, on the dev data:
///   flutter drive -d SIMULATOR_ID --driver=test_driver/integration_test.dart \
///     --target=integration_test/live_test.dart \
///     --dart-define=API_URL=http://localhost:8080/api/v1 --dart-define=OTP_LOG=/path/to/api.log
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'tenant: code sign-in, balance, pay by M-Pesa, invoices, statement',
    (tester) async {
      await SecureTokenStore().clear();
      await tester.pumpWidget(const ProviderScope(child: HodiApp()));
      await waitFor(tester, find.text('Sign in with a code by SMS'));
      await shot(binding, tester, '01-sign-in');

      await tapOn(tester, find.text('Sign in with a code by SMS'));
      await typeInto(tester, 'Phone number', '0711000210');
      final codesBefore = codeCount();
      await tapOn(tester, find.widgetWithText(FilledButton, 'Send code'));
      await typeInto(tester, 'Code', await nextCode(codesBefore));
      await tapOn(tester, find.widgetWithText(FilledButton, 'Sign in'));

      await waitFor(tester, find.textContaining('Hello,'));
      await waitFor(tester, find.text('How to pay'));
      await shot(binding, tester, '02-tenant-home');

      await tapOn(
        tester,
        find.textContaining(RegExp(r'^Pay (now|in advance)$')),
      );
      await typeInto(tester, 'Amount (KES)', '100');
      await shot(binding, tester, '03-pay-sheet');
      await tapOn(tester, find.text('Send M-Pesa prompt'));
      await waitFor(tester, find.text('Check the phone'));
      await shot(binding, tester, '04-pay-waiting');
      await waitFor(
        tester,
        find.textContaining('received (M-Pesa'),
        timeout: const Duration(seconds: 30),
      );
      await shot(binding, tester, '05-pay-paid');
      await tapOn(tester, find.text('Close'));

      await tapOn(tester, find.text('Invoices'));
      await waitFor(tester, find.textContaining('INV-'));
      await tapOn(tester, find.textContaining('INV-'));
      await waitFor(tester, find.text('Charges'));
      await shot(binding, tester, '06-invoice');
      await tester.pageBack();
      await tester.pump(const Duration(milliseconds: 500));

      await tapOn(tester, find.text('Payments'));
      await waitFor(tester, find.textContaining('M-Pesa'));
      await shot(binding, tester, '07-payments');

      await tapOn(tester, find.text('Statement'));
      await waitFor(tester, find.text('Closing balance'));
      await shot(binding, tester, '08-statement');

      await tapOn(tester, find.byTooltip('Account'));
      await tapOn(tester, find.text('Sign out'));
      await waitFor(tester, find.text('Sign in with a code by SMS'));
    },
  );

  testWidgets(
    'staff: sign in, tenant, record a payment, M-Pesa prompt, meter reading with photo, expense',
    (tester) async {
      final picker = FakeImagePicker();
      ImagePickerPlatform.instance = picker;
      await SecureTokenStore().clear();
      await tester.pumpWidget(const ProviderScope(child: HodiApp()));
      await waitFor(tester, find.text('Sign in with a code by SMS'));
      await typeInto(tester, 'Email or phone', 'agency-owner@example.invalid');
      await typeInto(tester, 'Password', 'Correct-horse-2026');
      await tapOn(tester, find.widgetWithText(FilledButton, 'Sign in'));
      await waitFor(tester, find.text('Units'));
      await tester.pump(const Duration(seconds: 2));
      await shot(binding, tester, '10-staff-home');

      // Tenants → Achieng → record a cash/bank payment.
      await tapOn(tester, find.text('Tenants'));
      final search = find.byWidgetPredicate(
        (w) =>
            w is TextField &&
            w.decoration?.hintText == 'Name, phone or tenant code',
      );
      await waitFor(tester, search);
      await tester.enterText(search.first, 'Achieng');
      await waitFor(
        tester,
        find.textContaining('Achieng'),
        timeout: const Duration(seconds: 10),
      );
      await tester.pump(const Duration(seconds: 1));
      await tapOn(tester, find.textContaining('Achieng Otieno'));
      await waitFor(tester, find.text('Record payment'));
      await tester.pump(const Duration(seconds: 1));
      await shot(binding, tester, '11-tenant-detail');

      await tapOn(tester, find.text('Record payment'));
      await typeInto(tester, 'Amount received (KES)', '50');
      await tapOn(tester, find.text('Channel'));
      await tapOn(tester, find.textContaining('Equity collections'));
      await typeInto(
        tester,
        'Bank slip no.',
        'LIVE${DateTime.now().millisecondsSinceEpoch}',
      );
      await shot(binding, tester, '12-record-payment');
      await tapOn(
        tester,
        find.widgetWithText(FilledButton, 'Record KES 50.00'),
      );
      await waitFor(tester, find.textContaining('Payment recorded'));
      await shot(binding, tester, '13-payment-recorded');
      await tapOn(tester, find.text('Done'));

      // M-Pesa prompt to the tenant (simulated: succeeds after ~4 s).
      await tapOn(tester, find.text('Send M-Pesa prompt'));
      await typeInto(tester, 'Amount (KES)', '20');
      await tapOn(
        tester,
        find.widgetWithText(FilledButton, 'Send M-Pesa prompt'),
      );
      await waitFor(
        tester,
        find.textContaining('received (M-Pesa'),
        timeout: const Duration(seconds: 30),
      );
      await shot(binding, tester, '14-staff-stk-paid');
      await tapOn(tester, find.text('Close'));
      await tester.pageBack();
      await tester.pump(const Duration(seconds: 1));

      // More → meter readings → first meter of the first property, with a photo.
      await tapOn(tester, find.text('More'));
      await tapOn(tester, find.text('Meter readings'));
      await tapOn(
        tester,
        find.widgetWithText(DropdownButtonFormField<String>, 'Property'),
      );
      await tapOn(tester, find.text('Kilimani Court').last);
      await waitFor(
        tester,
        find.textContaining(' · '),
        timeout: const Duration(seconds: 10),
      );
      await tester.pump(const Duration(seconds: 1));
      await shot(binding, tester, '15-meters');
      await tapOn(tester, find.textContaining('no readings yet'));
      await waitFor(tester, find.byKey(const Key('reading-current')));
      await tester.enterText(find.byKey(const Key('reading-current')), '210.5');
      await tapOn(tester, find.text('Add a photo of the meter'));
      await tapOn(tester, find.text('Take a photo'));
      await waitFor(tester, find.byTooltip('Remove photo'));
      await shot(binding, tester, '16-reading');
      await tapOn(tester, find.text('Save reading'));
      await waitFor(tester, find.textContaining('Reading saved for'));
      await shot(binding, tester, '17-reading-saved');
      expect(picker.picks, 1);
    },
  );
}
