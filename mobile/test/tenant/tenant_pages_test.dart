import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/tenant/tenant_more_pages.dart';

import '../helpers/app_harness.dart';
import '../helpers/fake_http.dart';
import 'tenant_dashboard_test.dart' show session;

void main() {
  testWidgets('notices show who they came from', (tester) async {
    final adapter = FakeAdapter(
      (c) => switch (c.path) {
        '/tenant/notices' => (
          200,
          {
            'data': [
              {
                'id': 'n1',
                'kind': 'broadcast',
                'title': 'Water off Saturday',
                'body': 'From 9am',
                'actionUrl': '/tenant',
                'readAt': null,
                'createdAt': '2026-11-04T08:00:00.000Z',
                'tenantId': 't1',
                'orgName': 'Ivory Breeze',
              },
            ],
            'meta': {'page': 1, 'totalPages': 1},
          },
        ),
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
    expect(find.textContaining('Ivory Breeze'), findsOneWidget);
    expect(
      adapter.calls.any(
        (c) => c.path == '/tenant/notices' && c.query['tenantId'] == null,
      ),
      isTrue,
    );
  });

  testWidgets('profile: phone and email are read-only, with who to ask', (
    tester,
  ) async {
    await pumpWithApi(
      tester,
      const TenantProfileScreen(),
      adapter: FakeAdapter((_) => (200, {'data': {}})),
      session: session(),
    );
    expect(find.text('+254700000001'), findsOneWidget);
    expect(find.textContaining('ask your landlord or agency'), findsOneWidget);
    await tester.drag(find.byType(ListView), const Offset(0, -1200));
    await tester.pumpAndSettle();
    expect(find.text('Ivory Breeze'), findsOneWidget);
    expect(find.text('Ruaka Estates'), findsOneWidget);
  });
}
