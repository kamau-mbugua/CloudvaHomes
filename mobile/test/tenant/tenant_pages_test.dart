import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/tenant/tenant_more_pages.dart';

import '../helpers/app_harness.dart';
import '../helpers/fake_http.dart';
import 'home_switcher_test.dart' show tenancy;
import 'tenant_dashboard_test.dart' show session;

Map<String, Object?> _notice(
  String id,
  String kind,
  String title,
  String createdAt, {
  bool read = false,
  String? link = '/tenant',
}) => {
  'id': id,
  'kind': kind,
  'title': title,
  'body': 'Details for $title',
  'actionUrl': link,
  'readAt': read ? '2026-11-04T09:00:00.000Z' : null,
  'createdAt': createdAt,
  'tenantId': 't1',
  'orgName': 'Ivory Breeze',
};

void _bigPhone(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

/// The printing plugin has no native side in tests: no renderer, so tiles fall back to an
/// icon (after the raster timeout) and the preview says it can't render.
void _fakePrinting() {
  const channel = MethodChannel('net.nfet.printing');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(
        channel,
        (call) async => switch (call.method) {
          'printingInfo' => <String, Object?>{
            'directPrint': false,
            'dynamicLayout': false,
            'canPrint': false,
            'canConvertHtml': false,
            'canShare': false,
            'canRaster': false,
            'canListPrinters': false,
          },
          _ => null,
        },
      );
  addTearDown(
    () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null),
  );
}

void main() {
  group('notices', () {
    test('day labels', () {
      final now = DateTime(2026, 11, 23, 10);
      expect(noticeDayLabel(DateTime(2026, 11, 23, 8), now), 'Today');
      expect(noticeDayLabel(DateTime(2026, 11, 22, 23), now), 'Yesterday');
      expect(noticeDayLabel(DateTime(2026, 11, 19), now), 'Thu 19 Nov');
      expect(noticeDayLabel(DateTime(2026, 10, 2), now), '2 Oct');
      expect(noticeDayLabel(DateTime(2025, 10, 2), now), '2 Oct 2025');
    });

    test('kinds get their own look', () {
      expect(noticeLook('REMINDER_OVERDUE').icon, Icons.warning_amber_rounded);
      expect(noticeLook('PAYMENT_RECEIVED').icon, Icons.check_circle_outline);
      expect(noticeLook('INVOICE_ISSUED').icon, Icons.receipt_long_outlined);
      expect(noticeLook('BROADCAST').icon, Icons.campaign_outlined);
    });

    testWidgets(
      'grouped by day, with who sent them; tapping one marks it read',
      (tester) async {
        _bigPhone(tester);
        final adapter = FakeAdapter(
          (c) => switch (c.path) {
            '/tenant/notices' => (
              200,
              {
                'data': [
                  _notice(
                    'n1',
                    'BROADCAST',
                    'Water off Saturday',
                    '2026-11-04T08:00:00.000Z',
                    link: null,
                  ),
                  _notice(
                    'n2',
                    'INVOICE_ISSUED',
                    'New invoice INV-2026-000011',
                    '2026-11-03T08:00:00.000Z',
                    read: true,
                  ),
                ],
                'meta': {'page': 1, 'totalPages': 1},
              },
            ),
            '/notifications/n1/read' => (200, {'data': {}}),
            _ => (
              200,
              {
                'data': {
                  'balance': 0,
                  'credit': 0,
                  'depositHeld': 0,
                  'homes': 0,
                  'tenancies': [],
                  'openInvoices': [],
                  'accounts': [],
                },
              },
            ),
          },
        );
        await pumpWithApi(
          tester,
          const TenantNoticesScreen(),
          adapter: adapter,
          session: session(),
        );
        expect(find.text('Water off Saturday'), findsOneWidget);
        expect(find.text('New invoice INV-2026-000011'), findsOneWidget);
        expect(find.text('Ivory Breeze'), findsNWidgets(2));
        expect(find.text('4 NOV'), findsOneWidget);
        expect(find.text('3 NOV'), findsOneWidget);
        expect(find.byKey(const Key('unread-n1')), findsOneWidget);
        expect(find.byKey(const Key('unread-n2')), findsNothing);
        expect(find.text('Mark all read'), findsOneWidget);
        expect(
          adapter.calls.any(
            (c) => c.path == '/tenant/notices' && c.query['tenantId'] == null,
          ),
          isTrue,
        );

        await tester.tap(find.byKey(const Key('notice-n1')));
        await settle(tester);
        expect(
          adapter.calls.where((c) => c.path == '/notifications/n1/read'),
          hasLength(1),
        );
        expect(find.byKey(const Key('unread-n1')), findsNothing);
        expect(find.text('Mark all read'), findsNothing);
      },
    );
  });

  group('profile', () {
    testWidgets('a summary: contact details read-only, changes in sheets', (
      tester,
    ) async {
      _bigPhone(tester);
      await pumpWithApi(
        tester,
        const TenantProfileScreen(),
        adapter: FakeAdapter((_) => (200, {'data': {}})),
        session: session(),
      );
      expect(find.text('+254700000001'), findsOneWidget);
      expect(
        find.textContaining('ask your landlord or agency'),
        findsOneWidget,
      );
      expect(find.text('Ivory Breeze'), findsOneWidget);
      expect(find.text('Ruaka Estates'), findsOneWidget);
      // No password fields on the page itself any more.
      expect(find.widgetWithText(TextField, 'Current password'), findsNothing);
      expect(find.text('Change password'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Delete my account'), 200);
      expect(find.text('Delete my account'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.byKey(const Key('profile-name')),
        -200,
      );

      await tester.tap(find.byKey(const Key('profile-name')));
      await tester.pumpAndSettle();
      expect(find.text('Your name'), findsOneWidget);
      expect(find.widgetWithText(TextField, 'First name'), findsOneWidget);
    });

    testWidgets('code-only sign-ins are offered a first password', (
      tester,
    ) async {
      _bigPhone(tester);
      final s = session();
      (s['user'] as Map<String, Object?>)['hasPassword'] = false;
      await pumpWithApi(
        tester,
        const TenantProfileScreen(),
        adapter: FakeAdapter((_) => (200, {'data': {}})),
        session: s,
      );
      expect(find.text('Set a password'), findsOneWidget);
      await tester.tap(find.byKey(const Key('profile-password')));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextField, 'Current password'), findsNothing);
      expect(find.text('Send me a code to confirm'), findsOneWidget);
    });
  });

  group('documents', () {
    testWidgets('each home lists its documents as tiles that open a preview', (
      tester,
    ) async {
      _bigPhone(tester);
      _fakePrinting();
      final adapter = FakeAdapter(
        (c) => switch (c.path) {
          '/tenant/accounts/overview' => (
            200,
            {
              'data': {
                'balance': 0,
                'credit': 0,
                'depositHeld': 0,
                'homes': 1,
                'tenancies': [
                  {
                    ...tenancy('ty1', 't1', 'A1', 'Ivory Breeze'),
                    'hasSignedLease': true,
                  },
                ],
                'openInvoices': [],
                'accounts': [],
              },
            },
          ),
          final p when p.endsWith('/inspections') => (
            200,
            {
              'data': [
                {
                  'kind': 'MOVE_IN',
                  'inspectedOn': '2026-01-02',
                  'tenantAcknowledgedAt': null,
                },
              ],
            },
          ),
          // Not a real PDF: the thumbnail falls back to an icon.
          _ => (200, 'not-a-pdf'),
        },
      );
      await pumpWithApi(
        tester,
        const TenantDocumentsScreen(),
        adapter: adapter,
        session: session(),
      );
      expect(find.text('A1, Acacia Heights'), findsOneWidget);
      expect(find.text('Lease agreement'), findsOneWidget);
      expect(find.text('Signed lease'), findsOneWidget);
      expect(find.text('Move-in inspection'), findsOneWidget);
      expect(find.text('Please check'), findsOneWidget);

      await tester.tap(find.text('Move-in inspection'));
      await settle(tester, andSettle: false);
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(DocumentPreviewScreen), findsOneWidget);
      expect(find.byKey(const Key('doc-checked')), findsOneWidget);
    });
  });
}
