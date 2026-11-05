import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/tenant/home_scope_widgets.dart';

import '../helpers/app_harness.dart';
import '../helpers/fake_http.dart';
import 'home_switcher_test.dart' show tenancy;
import 'tenant_dashboard_test.dart' show session;

Map<String, Object?> sameLandlordTwoHomes() => {
  'balance': 0,
  'credit': 0,
  'depositHeld': 0,
  'homes': 3,
  'tenancies': [
    tenancy('ty1', 't1', 'G1', 'Ivory Breeze'),
    tenancy('ty2', 't1', 'B4', 'Ivory Breeze'),
    tenancy('ty3', 't2', 'S2', 'Ruaka Estates'),
  ],
  'openInvoices': [],
  'accounts': [],
};

void main() {
  testWidgets(
    'all homes: one chip per landlord; one home: the also-covers note',
    (tester) async {
      final adapter = FakeAdapter(
        (c) => (200, {'data': sameLandlordTwoHomes()}),
      );
      await pumpWithApi(
        tester,
        const Column(children: [HomeSwitcherChip(), LedgerScopeHeader()]),
        adapter: adapter,
        session: session(),
      );
      expect(find.widgetWithText(ChoiceChip, 'Ivory Breeze'), findsOneWidget);
      expect(find.widgetWithText(ChoiceChip, 'Ruaka Estates'), findsOneWidget);

      await tester.tap(find.text('All my homes (3)'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('G1, Acacia Heights · Ivory Breeze'));
      await tester.pumpAndSettle();
      expect(find.byType(ChoiceChip), findsNothing);
      expect(
        find.text(
          'This account with Ivory Breeze also covers B4, Acacia Heights.',
        ),
        findsOneWidget,
      );
    },
  );
}
