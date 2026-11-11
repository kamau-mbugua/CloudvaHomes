import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/auth/session.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/features/platform/platform_screens.dart';

import '../../staff/helpers.dart';

Session operator(String role) => Session(
  accessToken: 'token',
  user: SessionUser(
    id: 'u1',
    firstName: 'Sam',
    lastName: 'Sales',
    email: 'sales@example.invalid',
    isPlatformAdmin: role == 'SUPERADMIN',
    platformRole: role,
  ),
  organizations: const [],
  activeOrganization: null,
  permissions: const {},
  tenantOf: const [],
  ownerOf: const [],
);

Map<String, Object?> org() => {
  'id': 'o1',
  'name': 'Makini Homes',
  'billingRef': 'H00001',
  'kind': 'HOST',
  'status': 'TRIAL',
  'occupiedUnits': 3,
  'price': {'pricePerUnit': 10000, 'minimumMonthly': 50000},
};

Future<void> pump(WidgetTester tester, String role, Widget child) async {
  phoneSize(tester);
  final adapter = FakeAdapter({
    'GET /platform/organizations/o1': (_) => {'data': org()},
    'GET /platform/plans': (_) => {'data': <Object?>[]},
    'GET /platform/operators': (_) => {'data': <Object?>[]},
  });
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(fakeApi(adapter)),
        sessionProvider.overrideWith(() => FakeSession(operator(role))),
      ],
      child: MaterialApp(home: Scaffold(body: child)),
    ),
  );
  await tester.pumpAndSettle();
  // The session loads asynchronously; requests the loaded session starts need one more turn.
  await tester.pump();
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a salesperson sees no Operators tab', (tester) async {
    await pump(tester, 'SALESPERSON', const PlatformManageScreen());
    expect(find.text('Plans'), findsOneWidget);
    expect(find.text('Operators'), findsNothing);
  });

  testWidgets('a superadmin sees the Operators tab', (tester) async {
    await pump(tester, 'SUPERADMIN', const PlatformManageScreen());
    expect(find.text('Operators'), findsOneWidget);
  });

  testWidgets('a salesperson cannot change an organisation status', (
    tester,
  ) async {
    await pump(
      tester,
      'SALESPERSON',
      const PlatformOrgDetailScreen(orgId: 'o1'),
    );
    expect(find.text('Makini Homes'), findsWidgets);
    expect(find.text('Platform status actions'), findsNothing);
    expect(find.text('Suspend'), findsNothing);
  });

  testWidgets('a superadmin can change an organisation status', (tester) async {
    await pump(
      tester,
      'SUPERADMIN',
      const PlatformOrgDetailScreen(orgId: 'o1'),
    );
    expect(find.text('Suspend'), findsOneWidget);
  });
}
